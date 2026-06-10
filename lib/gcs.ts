import { GoogleAuth } from "google-auth-library";

let cachedAuth: GoogleAuth | null = null;

function getAuth() {
  if (!cachedAuth) {
    cachedAuth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  return cachedAuth;
}

/**
 * Retrieve GCP credentials (project ID and access token) dynamically from the environment
 */
export async function getGcpCredentials() {
  const auth = getAuth();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || (await auth.getProjectId());
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return {
    projectId,
    accessToken: tokenResponse.token ?? "",
  };
}

/**
 * Upload raw data (Buffer or string) to a Google Cloud Storage object
 */
export async function uploadFileToGcs(path: string, contentType: string, body: Buffer | string) {
  const { projectId, accessToken } = await getGcpCredentials();
  const bucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || `${projectId}-source-bucket`;
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(path)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": contentType,
    },
    body: body as any,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GCS upload failed for ${path}: ${response.status} ${response.statusText} - ${errText}`);
  }
  return await response.json();
}

/**
 * Download a file from GCS as a Buffer
 */
export async function downloadFileFromGcs(path: string): Promise<Buffer> {
  const { projectId, accessToken } = await getGcpCredentials();
  const bucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || `${projectId}-source-bucket`;
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GCS download failed for ${path}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Download a JSON file from GCS, returning null if it doesn't exist
 */
export async function downloadJsonFromGcs(path: string): Promise<any | null> {
  try {
    const buffer = await downloadFileFromGcs(path);
    return JSON.parse(buffer.toString("utf-8"));
  } catch (err: any) {
    if (err.message?.includes("404") || err.message?.includes("GCS download failed")) {
      return null;
    }
    throw err;
  }
}

/**
 * Silently record a virtual try-on action into GCS history/index.json
 */
export async function appendTryOnLog(logEntry: any) {
  const indexPath = "history/index.json";
  let index: any[] = [];
  try {
    const existing = await downloadJsonFromGcs(indexPath);
    if (Array.isArray(existing)) {
      index = existing;
    }
  } catch (err) {
    console.warn("Could not read stats index from GCS, initializing new list:", err);
  }

  // Keep index clean (recent 1000 items)
  index = [logEntry, ...index].slice(0, 1000);

  try {
    await uploadFileToGcs(indexPath, "application/json", JSON.stringify(index, null, 2));
  } catch (err) {
    console.error("Failed to update GCS try-on stats index:", err);
  }
}

function cleanBase64(base64Str: string): string {
  if (base64Str.startsWith("data:")) {
    const parts = base64Str.split(";base64,");
    if (parts.length > 1) {
      return parts[1];
    }
  }
  return base64Str;
}

/**
 * Perform silent GCS logging for a try-on request.
 * Saves user photo, garment photo, result photo, and updates the stats index.
 */
export async function saveTryOnRecord({
  id,
  timestamp,
  garmentMode,
  garmentType,
  productUrl,
  personImageBase64,
  productImageBase64,
  resultImageBase64,
  status,
  error,
}: {
  id: string;
  timestamp: string;
  garmentMode: string;
  garmentType?: string;
  productUrl: string;
  personImageBase64?: string;
  productImageBase64?: string;
  resultImageBase64?: string;
  status: "success" | "failed";
  error?: string | null;
}) {
  try {
    const uploadPromises: Promise<any>[] = [];

    if (personImageBase64) {
      const personClean = cleanBase64(personImageBase64);
      uploadPromises.push(
        uploadFileToGcs(`history/${id}/user.png`, "image/png", Buffer.from(personClean, "base64"))
      );
    }

    if (productImageBase64) {
      const productClean = cleanBase64(productImageBase64);
      uploadPromises.push(
        uploadFileToGcs(`history/${id}/garment.png`, "image/png", Buffer.from(productClean, "base64"))
      );
    }

    if (resultImageBase64) {
      const resultClean = cleanBase64(resultImageBase64);
      uploadPromises.push(
        uploadFileToGcs(`history/${id}/result.png`, "image/png", Buffer.from(resultClean, "base64"))
      );
    }

    // Wait for all image uploads to finish
    await Promise.all(uploadPromises);

    // Save metadata entry in stats index
    const logEntry = {
      id,
      timestamp,
      garmentMode,
      garmentType: garmentType || "tops",
      productUrl: garmentMode === "link" ? productUrl : "",
      status,
      error: error || null,
    };

    await appendTryOnLog(logEntry);
  } catch (err) {
    console.error("Error silently saving try-on logs to Cloud Storage:", err);
  }
}
