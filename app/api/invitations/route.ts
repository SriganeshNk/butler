import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { createPartnerInvitation } from "../../../lib/chat-store";

export async function POST(request: NextRequest) {
  const session = await auth();
  const user = session?.user;
  const email = user?.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "You must sign in first." }, { status: 401 });
  }

  const sessionUser = user!;

  const payload = (await request.json()) as {
    partnerEmail?: string;
  };

  if (!payload.partnerEmail?.trim()) {
    return NextResponse.json({ error: "Partner email is required." }, { status: 400 });
  }

  try {
    const room = await createPartnerInvitation(sessionUser, payload.partnerEmail);
    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invitation." },
      { status: 400 }
    );
  }
}
