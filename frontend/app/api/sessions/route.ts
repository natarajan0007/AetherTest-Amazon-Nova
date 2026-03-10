import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET() {
  const resp = await fetch(`${BACKEND}/api/sessions`);
  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const resp = await fetch(`${BACKEND}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
