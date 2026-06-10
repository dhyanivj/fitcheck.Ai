import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "A search query is required." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
      // Env vars not configured — signal the client to use manual upload
      return NextResponse.json({ fallback: "manual", images: [] });
    }

    // Extract meaningful search terms from the URL
    let searchQuery = query;
    try {
      const url = new URL(query);
      // Extract path segments, remove IDs and short tokens
      const pathParts = url.pathname
        .split("/")
        .filter((p) => p.length > 2 && !/^[0-9]+$/.test(p))
        .map((p) => p.replace(/[-_]/g, " "))
        .slice(0, 4);

      // Combine hostname context with path keywords
      const hostParts = url.hostname.replace("www.", "").split(".")[0];
      searchQuery = `${hostParts} ${pathParts.join(" ")} clothing product`;
    } catch {
      // Not a URL, use the raw query as-is
      searchQuery = `${query} clothing product`;
    }

    const searchUrl = new URL("https://www.googleapis.com/customsearch/v1");
    searchUrl.searchParams.set("key", apiKey);
    searchUrl.searchParams.set("cx", cx);
    searchUrl.searchParams.set("q", searchQuery);
    searchUrl.searchParams.set("searchType", "image");
    searchUrl.searchParams.set("num", "6");
    searchUrl.searchParams.set("imgType", "photo");
    searchUrl.searchParams.set("safe", "active");

    console.log(`Image search query: "${searchQuery}"`);

    const response = await fetch(searchUrl.toString());
    const data = await response.json();

    if (!response.ok) {
      console.error("Google Custom Search API error:", data);
      return NextResponse.json({ fallback: "manual", images: [] });
    }

    const images = (data.items || []).map((item: any) => ({
      url: item.link,
      title: item.title || "",
      thumbnail: item.image?.thumbnailLink || item.link,
      width: item.image?.width || 0,
      height: item.image?.height || 0,
    }));

    return NextResponse.json({ images });
  } catch (error: any) {
    console.error("Image search error:", error);
    return NextResponse.json(
      { fallback: "manual", images: [] }
    );
  }
}
