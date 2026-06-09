import { NextResponse } from "next/server";
import { downloadFileFromGcs } from "../../../../lib/gcs";

export async function POST(request: Request) {
  try {
    const { passcode, id } = await request.json();
    const requiredPasscode = process.env.DASHBOARD_PASSCODE;

    if (!requiredPasscode) {
      return NextResponse.json(
        { error: "Dashboard passcode is not configured in the server environment variables." },
        { status: 500 }
      );
    }

    if (passcode !== requiredPasscode) {
      return NextResponse.json({ error: "Invalid passcode." }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ error: "Missing try-on ID." }, { status: 400 });
    }

    let userImage: string | null = null;
    let garmentImage: string | null = null;
    let resultImage: string | null = null;

    try {
      const buf = await downloadFileFromGcs(`history/${id}/user.png`);
      userImage = `data:image/png;base64,${buf.toString("base64")}`;
    } catch (err) {
      console.warn(`User image not found for ${id}:`, err);
    }

    try {
      const buf = await downloadFileFromGcs(`history/${id}/garment.png`);
      garmentImage = `data:image/png;base64,${buf.toString("base64")}`;
    } catch (err) {
      console.warn(`Garment image not found for ${id}:`, err);
    }

    try {
      const buf = await downloadFileFromGcs(`history/${id}/result.png`);
      resultImage = `data:image/png;base64,${buf.toString("base64")}`;
    } catch (err) {
      console.warn(`Result image not found for ${id}:`, err);
    }

    return NextResponse.json({
      userImage,
      garmentImage,
      resultImage,
    });
  } catch (err: any) {
    console.error("Dashboard entry endpoint error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch images." }, { status: 500 });
  }
}
