import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { saveTryOnRecord } from "../../../lib/gcs";

// Set max duration for longer AI generation calls (VTO usually takes 10-25 seconds)
export const maxDuration = 120;

/**
 * Utility to strip data-url headers from base64 strings if present
 */
function cleanBase64(base64Str: string): string {
  if (base64Str.startsWith("data:")) {
    const parts = base64Str.split(";base64,");
    if (parts.length > 1) {
      return parts[1];
    }
  }
  return base64Str;
}

export async function POST(request: Request) {
  const tryOnId = `tryon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const timestamp = new Date().toISOString();
  let garmentMode = "upload";
  let garmentType = "tops";
  let productUrl = "";
  let personImageBase64 = "";
  let productImageBase64 = "";
  let resolvedGarmentType = "tops";

  try {
    const body = await request.json();
    personImageBase64 = body.personImageBase64;
    productImageBase64 = body.productImageBase64;
    garmentMode = body.garmentMode || (productImageBase64?.startsWith("http") ? "link" : "upload");
    garmentType = body.garmentType || "tops";
    productUrl = body.productUrl || "";

    // Validate inputs
    if (!personImageBase64 || !productImageBase64) {
      return NextResponse.json(
        { error: "Both personImageBase64 and productImageBase64 are required." },
        { status: 400 }
      );
    }

    // Resolve person image (could be raw base64 or a scraped image URL)
    let cleanPersonImage = "";
    if (personImageBase64.startsWith("http")) {
      try {
        console.log(`Fetching person image from URL: ${personImageBase64}`);
        const res = await fetch(personImageBase64);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        cleanPersonImage = Buffer.from(arrayBuffer).toString("base64");
      } catch (fetchErr: any) {
        return NextResponse.json(
          { error: `Failed to fetch person image URL on server: ${fetchErr.message || fetchErr}` },
          { status: 422 }
        );
      }
    } else {
      cleanPersonImage = cleanBase64(personImageBase64);
    }

    // Resolve product image (could be raw base64 or a scraped image URL)
    let cleanProductImage = "";
    if (productImageBase64.startsWith("http")) {
      try {
        console.log(`Fetching product image from URL: ${productImageBase64}`);
        const res = await fetch(productImageBase64);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        cleanProductImage = Buffer.from(arrayBuffer).toString("base64");
      } catch (fetchErr: any) {
        return NextResponse.json(
          { error: `Failed to fetch product image URL on server: ${fetchErr.message || fetchErr}` },
          { status: 422 }
        );
      }
    } else {
      cleanProductImage = cleanBase64(productImageBase64);
    }

    console.log("Initializing Google Cloud Auth client...");

    // Initialize the official Google Auth client
    // By default, this will look for GOOGLE_APPLICATION_CREDENTIALS environment variable
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

    let projectId: string;
    let accessToken: string | null = null;

    try {
      projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || (await auth.getProjectId());
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      accessToken = tokenResponse.token ?? null;
    } catch (authErr: any) {
      console.error("Authentication failed inside Vertex AI Try-On endpoint:", authErr);
      return NextResponse.json(
        {
          error: "Failed to authenticate with Google Cloud. Ensure GOOGLE_APPLICATION_CREDENTIALS or project configurations are set.",
          details: authErr.message || authErr,
        },
        { status: 500 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: "Google Cloud Project ID could not be determined. Please set the GOOGLE_CLOUD_PROJECT environment variable." },
        { status: 500 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "Could not retrieve Access Token for Google Cloud platform." },
        { status: 500 }
      );
    }

    const region = process.env.GOOGLE_CLOUD_LOCATION || process.env.GCP_REGION || "us-central1";
    // REST API Endpoint for Virtual Try-On (GA version of recontext_image model virtual-try-on-001)
    const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/virtual-try-on-001:predict`;

    console.log(`Sending prediction request to Vertex AI at: ${url}`);

    // Map garmentType to Vertex AI category
    let vertexGarmentType = "UPPER_BODY";
    if (garmentType === "bottoms") {
      vertexGarmentType = "LOWER_BODY";
    } else if (garmentType === "dress") {
      vertexGarmentType = "DRESS";
    } else if (garmentType === "auto") {
      // Auto-detect based on productUrl keywords
      const urlLower = (productUrl || "").toLowerCase();
      if (
        /pants|jean|skirt|trouser|short|bottom|legging|jogger|chino|pajama|palazzo|denim-shorts/.test(
          urlLower
        )
      ) {
        vertexGarmentType = "LOWER_BODY";
      } else if (/dress|gown|frock|jumpsuit|one-piece|maxi|midi/.test(urlLower)) {
        vertexGarmentType = "DRESS";
      } else {
        vertexGarmentType = "UPPER_BODY";
      }
    }

    resolvedGarmentType =
      vertexGarmentType === "LOWER_BODY"
        ? "bottoms"
        : vertexGarmentType === "DRESS"
        ? "dress"
        : "tops";

    // Vertex AI Virtual Try-On Predict payload structure
    const payload = {
      instances: [
        {
          personImage: {
            image: {
              bytesBase64Encoded: cleanPersonImage,
            },
          },
          productImages: [
            {
              image: {
                bytesBase64Encoded: cleanProductImage,
              },
            },
          ],
        },
      ],
      parameters: {
        numberOfImages: 1,
        garmentType: vertexGarmentType,
      },
    };

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let result: any = null;
    let errorMsg = "";

    const responseText = await apiResponse.text();
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("Failed to parse Vertex AI API response as JSON. Response text:", responseText);
      errorMsg = responseText || `HTTP Error ${apiResponse.status}: ${apiResponse.statusText}`;
    }

    if (!apiResponse.ok) {
      if (!errorMsg) {
        errorMsg = result?.error?.message || JSON.stringify(result);
      }
      console.error("Vertex AI API response error:", errorMsg);

      // Silent logging of Vertex AI failure
      saveTryOnRecord({
        id: tryOnId,
        timestamp,
        garmentMode,
        garmentType: resolvedGarmentType,
        productUrl,
        personImageBase64,
        productImageBase64,
        status: "failed",
        error: `Vertex AI Error: ${errorMsg}`,
      }).catch((err) => console.error("Background logging failed:", err));

      return NextResponse.json(
        {
          error: "Vertex AI Try-On prediction model returned an error.",
          details: errorMsg,
        },
        { status: apiResponse.status }
      );
    }

    if (!result) {
      return NextResponse.json(
        { error: "Invalid response from Vertex AI API: " + errorMsg },
        { status: 502 }
      );
    }

    const prediction = result.predictions?.[0];
    if (!prediction) {
      const errorMsg = "Vertex AI prediction request succeeded but returned no predictions array.";

      saveTryOnRecord({
        id: tryOnId,
        timestamp,
        garmentMode,
        garmentType: resolvedGarmentType,
        productUrl,
        personImageBase64,
        productImageBase64,
        status: "failed",
        error: errorMsg,
      }).catch((err) => console.error("Background logging failed:", err));

      return NextResponse.json(
        { error: errorMsg },
        { status: 500 }
      );
    }

    // Extract base64 image bytes from different possible formats returned by the Vertex endpoint
    let outputImageBase64 = "";
    if (typeof prediction === "string") {
      outputImageBase64 = prediction;
    } else if (prediction.imageBytes) {
      outputImageBase64 = prediction.imageBytes;
    } else if (prediction.bytesBase64Encoded) {
      outputImageBase64 = prediction.bytesBase64Encoded;
    } else if (prediction.image?.imageBytes) {
      outputImageBase64 = prediction.image.imageBytes;
    } else if (prediction.image?.image_bytes) {
      outputImageBase64 = prediction.image.image_bytes;
    } else {
      const errorMsg = "Failed to extract image bytes from prediction response. Schema mismatch.";
      console.error("Could not parse prediction response keys:", prediction);

      saveTryOnRecord({
        id: tryOnId,
        timestamp,
        garmentMode,
        garmentType: resolvedGarmentType,
        productUrl,
        personImageBase64,
        productImageBase64,
        status: "failed",
        error: errorMsg,
      }).catch((err) => console.error("Background logging failed:", err));

      return NextResponse.json(
        {
          error: errorMsg,
          debugPayload: prediction,
        },
        { status: 500 }
      );
    }

    // Return output image base64
    const mimeType = prediction.mimeType || "image/png";
    const resultBase64 = `data:${mimeType};base64,${outputImageBase64}`;

    // Silent logging of success
    saveTryOnRecord({
      id: tryOnId,
      timestamp,
      garmentMode,
      garmentType: resolvedGarmentType,
      productUrl,
      personImageBase64,
      productImageBase64,
      resultImageBase64: resultBase64,
      status: "success",
    }).catch((err) => console.error("Background logging failed:", err));

    return NextResponse.json({
      generatedImageBase64: resultBase64,
    });
  } catch (error: any) {
    console.error("Vertex AI Virtual Try-On main error:", error);

    // Silent logging of general failure
    saveTryOnRecord({
      id: tryOnId,
      timestamp,
      garmentMode,
      garmentType: resolvedGarmentType,
      productUrl,
      personImageBase64,
      productImageBase64,
      status: "failed",
      error: error.message || String(error),
    }).catch((err) => console.error("Background logging failed:", err));

    return NextResponse.json(
      { error: `Internal Server Error: ${error.message || error}` },
      { status: 500 }
    );
  }
}
