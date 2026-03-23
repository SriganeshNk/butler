import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { getRoom, saveMessage } from "../../../lib/chat-store";

export async function GET() {
  const session = await auth();
  const user = session?.user;

  if (!user?.email) {
    return NextResponse.json({ error: "You must sign in first." }, { status: 401 });
  }

  const sessionUser = user;

  return NextResponse.json(await getRoom(sessionUser));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const user = session?.user;

  if (!user?.email) {
    return NextResponse.json({ error: "You must sign in first." }, { status: 401 });
  }

  const sessionUser = user;

  const payload = (await request.json()) as {
    text?: string;
  };

  if (!payload.text?.trim()) {
    return NextResponse.json(
      { error: "Text is required." },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await saveMessage(sessionUser, payload.text.trim()), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send message." },
      { status: 400 }
    );
  }
}
