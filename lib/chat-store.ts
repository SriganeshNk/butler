import { randomUUID } from "node:crypto";
import { ensureDatabase, getPool } from "@/lib/db";
import type { ChatMessage, LinkPreview, Participant } from "@/lib/types";
import { extractLinkPreviews } from "@/lib/unfurl";

type MessageRow = {
  id: string;
  author: Participant;
  text: string;
  previews: LinkPreview[];
  created_at: Date;
};

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    author: row.author,
    text: row.text,
    previews: row.previews,
    createdAt: row.created_at.toISOString()
  };
}

export async function getMessages(): Promise<ChatMessage[]> {
  await ensureDatabase();

  const result = await getPool().query<MessageRow>(
    `
      select id, author, text, previews, created_at
      from messages
      order by created_at asc
    `
  );

  return result.rows.map(toChatMessage);
}

export async function saveMessage(author: Participant, text: string): Promise<ChatMessage[]> {
  await ensureDatabase();

  const previews = await extractLinkPreviews(text);

  await getPool().query(
    `
      insert into messages (id, author, text, previews)
      values ($1, $2, $3, $4::jsonb)
    `,
    [randomUUID(), author, text, JSON.stringify(previews)]
  );

  return getMessages();
}
