import { NextResponse } from "next/server";
import puppeteer from "puppeteer";

export const maxDuration = 300; // Allow serverless environments to run up to 5 mins

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
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    });

    console.log(`Navigating to URL: ${url}`);
    
    // Navigate and wait for content to load
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Short wait to allow lazy-loaded scripts/images to evaluate
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2000)));

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
          "div._2Am1fK img" // Detail image
        ];
        for (const sel of mainImgSelectors) {
          const img = document.querySelector(sel) as HTMLImageElement | null;
          if (img && img.src && !img.src.includes("placeholder")) {
            return resolveUrl(img.src);
          }
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

      // 5. General fallback if specific site hooks fail - prefer OpenGraph metadata
      if (ogImage) return resolveUrl(ogImage);
      if (twitterImage) return resolveUrl(twitterImage);

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
      const pageTitle = await page.title();
      const pageContent = await page.content();
      console.log(`Failed to scrape. Page title: "${pageTitle}". HTML Snippet: ${pageContent.substring(0, 1000)}`);
      return NextResponse.json(
        { error: "Could not locate a high-resolution product image on the page." },
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
