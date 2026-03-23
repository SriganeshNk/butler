import { NextRequest, NextResponse } from "next/server";
import { getMessages, saveMessage } from "@/lib/chat-store";

export async function GET() {
  const messages = await getMessages();
  return NextResponse.json({ messages });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as {
    author?: "You" | "Wife";
    text?: string;
  };

  if (
    (payload.author !== "You" && payload.author !== "Wife") ||
    !payload.text?.trim()
  ) {
    return NextResponse.json(
      { error: "Both author and text are required." },
      { status: 400 }
    );
  }

  const messages = await saveMessage(payload.author, payload.text.trim());
  return NextResponse.json({ messages }, { status: 201 });
}
