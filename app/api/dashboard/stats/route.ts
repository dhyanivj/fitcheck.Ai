import { NextResponse } from "next/server";
import { downloadJsonFromGcs } from "../../../../lib/gcs";

export async function POST(request: Request) {
  try {
    const { passcode } = await request.json();
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

    const index = await downloadJsonFromGcs("history/index.json");
    return NextResponse.json({ stats: index || [] });
  } catch (err: any) {
    console.error("Dashboard stats endpoint error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch stats." }, { status: 500 });
  }
}
