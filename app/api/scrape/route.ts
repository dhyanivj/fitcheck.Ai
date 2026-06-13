import { NextResponse } from "next/server";
import puppeteer from "puppeteer";

export const maxDuration = 300; // Allow serverless environments to run up to 5 mins

// Helper to try a fast HTTP fetch for extraction (bypasses Puppeteer for sites blocking headless browsers)
async function scrapeWithFetch(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`scrapeWithFetch: HTTP error status ${response.status} for ${url}`);
      return null;
    }

    const html = await response.text();
    
    // 1. Try OG Image
    const ogRegexes = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']og:image["']/i,
    ];

    for (const regex of ogRegexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        const decoded = match[1].replace(/&amp;/g, "&");
        return new URL(decoded, url).href;
      }
    }

    // 2. Try Twitter Image
    const twitterRegexes = [
      /<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']twitter:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];

    for (const regex of twitterRegexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        const decoded = match[1].replace(/&amp;/g, "&");
        return new URL(decoded, url).href;
      }
    }

    // 3. Try to look for schema.org Product markup or other JSON-LD containing image URL
    const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1].trim());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item["@type"] === "Product" || item.image) {
            const imgVal = item.image;
            if (typeof imgVal === "string") {
              return new URL(imgVal, url).href;
            } else if (Array.isArray(imgVal) && typeof imgVal[0] === "string") {
              return new URL(imgVal[0], url).href;
            } else if (imgVal && typeof imgVal === "object" && typeof imgVal.url === "string") {
              return new URL(imgVal.url, url).href;
            }
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    }
  } catch (err) {
    console.error(`scrapeWithFetch: Error scraping with fetch:`, err);
  }
  return null;
}

export async function POST(request: Request) {
  let browser;
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "A valid e-commerce URL is required." },
        { status: 400 }
      );
    }

    // 1. Try fast raw fetch scraper first to bypass Puppeteer blocks
    console.log(`Trying fast fetch scraper for URL: ${url}`);
    const fetchScrapedUrl = await scrapeWithFetch(url);
    if (fetchScrapedUrl) {
      console.log(`Fast fetch scraper succeeded: ${fetchScrapedUrl}`);
      return NextResponse.json({ productImageUrl: fetchScrapedUrl });
    }
    console.log(`Fast fetch scraper returned no image. Falling back to Puppeteer...`);

    // Initialize Puppeteer with stealth-like arguments and headless mode
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
    });

    const page = await browser.newPage();
    
    // Set viewport to mimic desktop user
    await page.setViewport({ width: 1280, height: 800 });

    // Inject request headers to look like a standard web browser
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"',
    });

    // Bypass simple navigator.webdriver checks used by bot detectors
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    console.log(`Navigating to URL: ${url}`);
    
    // Navigate and capture the response status
    const pageResponse = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const pageStatus = pageResponse ? pageResponse.status() : 200;
    if (pageStatus === 404) {
      console.log(`Scraper returned 404 for ${url}`);
      return NextResponse.json(
        { error: "Product page not found (404). Please verify the product link." },
        { status: 404 }
      );
    }

    // Short wait to allow lazy-loaded scripts/images to evaluate
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2000)));

    const pageTitle = await page.title();
    const pageContent = await page.content();

    // Detect if we were blocked by bot protection (Cloudflare, Akamai, Robot check, etc.)
    const isBotBlocked = 
      pageTitle.toLowerCase().includes("robot check") ||
      pageTitle.toLowerCase().includes("captcha") ||
      pageTitle.toLowerCase().includes("access denied") ||
      pageTitle.toLowerCase().includes("attention required") ||
      pageContent.toLowerCase().includes("captcha") ||
      pageContent.toLowerCase().includes("perimeterx") ||
      pageContent.toLowerCase().includes("akamai") ||
      pageContent.toLowerCase().includes("cloudflare");

    if (isBotBlocked) {
      console.log(`Scraper blocked by bot-detection. Page Title: "${pageTitle}"`);
      return NextResponse.json(
        { 
          error: `Automated access blocked by ${url.includes("amazon") ? "Amazon" : url.includes("flipkart") ? "Flipkart" : "the website"}'s security. Please take a screenshot of the product and upload it below.`,
          isBlocked: true 
        },
        { status: 403 }
      );
    }

    // Extract product image based on heuristics and specific site structures
    const scrapedImageUrl = await page.evaluate(() => {
      const currentUrl = window.location.href.toLowerCase();

      // 1. Meta tag checkers (highly reliable for social previews, usually high resolution)
      const getMeta = (metaNameOrProperty: string) => {
        const element = 
          document.querySelector(`meta[property="${metaNameOrProperty}"]`) ||
          document.querySelector(`meta[name="${metaNameOrProperty}"]`);
        return element ? element.getAttribute("content") : null;
      };

      const ogImage = getMeta("og:image");
      const twitterImage = getMeta("twitter:image");

      // Helper function to resolve absolute URL
      const resolveUrl = (src: string | null) => {
        if (!src) return null;
        try {
          return new URL(src, window.location.href).href;
        } catch {
          return src;
        }
      };

      // 2. Specific selectors for Amazon
      if (currentUrl.includes("amazon.")) {
        // High-res zoom image attribute is highly reliable
        const oldHires = document.querySelector("img[data-old-hires]") as HTMLImageElement | null;
        if (oldHires) {
          const src = oldHires.getAttribute("data-old-hires");
          if (src) return resolveUrl(src);
        }

        const landingImage = document.querySelector("#landingImage") as HTMLImageElement | null;
        if (landingImage) {
          // Amazon landingImage usually has a JSON string inside data-a-dynamic-image
          // containing mappings of URL -> [width, height]. We want the largest one.
          const dynamicImgAttr = landingImage.getAttribute("data-a-dynamic-image");
          if (dynamicImgAttr) {
            try {
              const imageMap = JSON.parse(dynamicImgAttr);
              let largestUrl = "";
              let maxArea = 0;
              for (const [imgUrl, dims] of Object.entries(imageMap)) {
                if (Array.isArray(dims) && dims.length === 2) {
                  const area = dims[0] * dims[1];
                  if (area > maxArea) {
                    maxArea = area;
                    largestUrl = imgUrl;
                  }
                }
              }
              if (largestUrl) return resolveUrl(largestUrl);
            } catch (e) {
              console.error("Failed to parse Amazon data-a-dynamic-image json", e);
            }
          }
          if (landingImage.src) return resolveUrl(landingImage.src);
        }

        // Amazon book cover or fallback main image
        const mainImage = (
          document.querySelector("#imgBlkFront") || 
          document.querySelector("#main-image") || 
          document.querySelector("#ebooksImgBlkFront")
        ) as HTMLImageElement | null;
        if (mainImage && mainImage.src) return resolveUrl(mainImage.src);
      }

      // 3. Specific selectors for Flipkart
      if (currentUrl.includes("flipkart.")) {
        // Flipkart zoom or main image selectors
        const mainImgSelectors = [
          "img.q67YwT", // Standard PDP Main image
          "img._396cs4", // Legacy listing or PDP image
          "img._2r_l1q", // Alternative PDP image
          "div._3exPp9 img", // Image carousel images
          "div._2Am1fK img", // Detail image
          "img.DByoEF",
          "img.W55Z2g",
          "img.cPHr8F",
          "div.ZOZ1Pr img",
          "div.CXW8mj img"
        ];
        for (const sel of mainImgSelectors) {
          const img = document.querySelector(sel) as HTMLImageElement | null;
          if (img && img.src && !img.src.includes("placeholder")) {
            return resolveUrl(img.src);
          }
        }

        // Resilient fallback: find any image with alt text starting with first 3 words of page title
        const pageTitleText = document.title.split("|")[0].trim().toLowerCase();
        const firstWords = pageTitleText.split(" ").slice(0, 3).join(" ");
        if (firstWords.length > 3) {
          const matchingAltImg = Array.from(document.querySelectorAll("img")).find(img => {
            const alt = (img.alt || "").toLowerCase();
            return alt.includes(firstWords) && !alt.includes("logo") && !alt.includes("icon");
          });
          if (matchingAltImg && matchingAltImg.src) return resolveUrl(matchingAltImg.src);
        }
      }

      // 4. Specific selectors for Myntra
      if (currentUrl.includes("myntra.")) {
        const myntraImgSelectors = [
          "img.pdp-modastring",
          "img.image-grid-image",
          "div.image-grid-col img",
          "div.image-grid-container img"
        ];
        for (const sel of myntraImgSelectors) {
          const img = document.querySelector(sel) as HTMLImageElement | null;
          if (img && img.src) {
            return resolveUrl(img.src);
          }
        }
      }

      // 5. General fallback if specific site hooks fail - prefer OpenGraph/Twitter/Schema metadata
      if (ogImage) return resolveUrl(ogImage);
      if (twitterImage) return resolveUrl(twitterImage);

      const itempropImg = document.querySelector('[itemprop="image"]') as HTMLImageElement | null;
      if (itempropImg && itempropImg.src) return resolveUrl(itempropImg.src);

      const productClassImg = document.querySelector('[class*="product-image"] img, [class*="pdp-image"] img, [id*="product-image"] img, [class*="gallery"] img') as HTMLImageElement | null;
      if (productClassImg && productClassImg.src) return resolveUrl(productClassImg.src);

      // 6. Generic heuristics: find all visible images and score them based on size and names
      const images = Array.from(document.querySelectorAll("img"));
      const candidates = images
        .map((img) => {
          const src = img.src || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
          const rect = img.getBoundingClientRect();
          const width = rect.width || img.naturalWidth || 0;
          const height = rect.height || img.naturalHeight || 0;
          const area = width * height;
          
          // Filter out obvious logos, spacer pixels, and social icons
          const isBlacklisted = 
            (src && (
              src.includes("logo") || 
              src.includes("icon") || 
              src.includes("banner") || 
              src.includes("spinner") || 
              src.includes("sprite") || 
              src.includes("pixel") ||
              src.endsWith(".gif") ||
              src.includes("avatar")
            )) || 
            area < 25000; // Filter out images smaller than 150x150 approx (22500px area)

          return {
            url: resolveUrl(src),
            area,
            isBlacklisted,
            element: img
          };
        })
        .filter(c => c.url && !c.isBlacklisted)
        .sort((a, b) => b.area - a.area); // Sort descending by size

      if (candidates.length > 0) {
        return candidates[0].url;
      }

      return null;
    });

    console.log(`Scraped Image Result: ${scrapedImageUrl}`);

    if (!scrapedImageUrl) {
      console.log(`Failed to scrape. Page title: "${pageTitle}". HTML Snippet length: ${pageContent.length}`);
      return NextResponse.json(
        { error: "Could not locate a high-resolution product image on the page. Please ensure the link is a direct product page." },
        { status: 422 }
      );
    }

    return NextResponse.json({ productImageUrl: scrapedImageUrl });
  } catch (error: any) {
    console.error("Scraping error:", error);
    return NextResponse.json(
      { error: `Scraping failed: ${error.message || error}` },
      { status: 500 }
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Error closing Puppeteer browser:", closeError);
      }
    }
  }
}
