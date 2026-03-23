import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { ensureDatabase, getPool } from "./db";
import type { User } from "next-auth";
import type { AppUser, ChatMessage, ChatRoom, LinkPreview, PendingInvitation } from "./types";
import { extractLinkPreviews } from "./unfurl";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type UserRow = AppUser;

type PartnershipRow = {
  id: string;
  user_one_email: string;
  user_two_email: string;
};

type PendingInvitationRow = {
  inviter_email: string;
  invitee_email: string;
  inviter_name?: string;
};

type MessageRow = {
  id: string;
  author_email: string;
  author_name: string;
  text: string;
  previews: LinkPreview[];
  created_at: Date;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sortEmails(left: string, right: string) {
  return [left, right].sort((a, b) => a.localeCompare(b)) as [string, string];
}

function toAppUser(row: UserRow): AppUser {
  return {
    email: row.email,
    name: row.name,
    image: row.image
  };
}

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    authorEmail: row.author_email,
    authorName: row.author_name,
    text: row.text,
    previews: row.previews,
    createdAt: row.created_at.toISOString()
  };
}

async function upsertUser(user: User, client: Queryable = getPool()) {
  const email = normalizeEmail(user.email ?? "");
  const name = user.name?.trim() || email;

  if (!email) {
    throw new Error("Signed-in user email is required.");
  }

  await client.query(
    `
      insert into app_users (email, name, image)
      values ($1, $2, $3)
      on conflict (email) do update
      set name = excluded.name,
          image = excluded.image
    `,
    [email, name, user.image ?? null]
  );
}

async function getUserByEmail(email: string, client: Queryable = getPool()): Promise<AppUser | null> {
  const result = await client.query<UserRow>(
    `
      select email, name, image
      from app_users
      where email = $1
    `,
    [normalizeEmail(email)]
  );

  const row = result.rows[0];
  return row ? toAppUser(row) : null;
}

async function getPartnershipByEmail(
  email: string,
  client: Queryable = getPool()
): Promise<PartnershipRow | null> {
  const normalizedEmail = normalizeEmail(email);
  const result = await client.query<PartnershipRow>(
    `
      select id, user_one_email, user_two_email
      from partnerships
      where user_one_email = $1 or user_two_email = $1
      limit 1
    `,
    [normalizedEmail]
  );

  return result.rows[0] ?? null;
}

function getPartnerEmail(partnership: PartnershipRow, viewerEmail: string) {
  const normalizedEmail = normalizeEmail(viewerEmail);

  return partnership.user_one_email === normalizedEmail
    ? partnership.user_two_email
    : partnership.user_one_email;
}

async function createPartnership(
  inviterEmail: string,
  inviteeEmail: string,
  client: Queryable = getPool()
) {
  const [userOneEmail, userTwoEmail] = sortEmails(
    normalizeEmail(inviterEmail),
    normalizeEmail(inviteeEmail)
  );

  const existing = await getPartnershipByEmail(userOneEmail, client);

  if (existing) {
    return existing;
  }

  const result = await client.query<PartnershipRow>(
    `
      insert into partnerships (id, user_one_email, user_two_email)
      values ($1, $2, $3)
      returning id, user_one_email, user_two_email
    `,
    [randomUUID(), userOneEmail, userTwoEmail]
  );

  await client.query(
    `
      delete from partner_invitations
      where inviter_email in ($1, $2)
         or invitee_email in ($1, $2)
    `,
    [userOneEmail, userTwoEmail]
  );

  return result.rows[0];
}

async function syncInvitationAcceptance(email: string) {
  const client = await getPool().connect();

  try {
    await client.query("begin");

    const existingPartnership = await getPartnershipByEmail(email, client);
    if (existingPartnership) {
      await client.query("commit");
      return existingPartnership;
    }

    const pendingInvite = await client.query<PendingInvitationRow>(
      `
        select inviter_email, invitee_email
        from partner_invitations
        where invitee_email = $1
        limit 1
        for update
      `,
      [normalizeEmail(email)]
    );

    const invite = pendingInvite.rows[0];

    if (!invite) {
      await client.query("commit");
      return null;
    }

    const inviterPartnership = await getPartnershipByEmail(invite.inviter_email, client);

    if (inviterPartnership) {
      await client.query("commit");
      return null;
    }

    const partnership = await createPartnership(invite.inviter_email, invite.invitee_email, client);
    await client.query("commit");
    return partnership;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function getMessagesForPartnership(
  partnershipId: string,
  client: Queryable = getPool()
): Promise<ChatMessage[]> {
  const result = await client.query<MessageRow>(
    `
      select
        conversation_messages.id,
        conversation_messages.author_email,
        app_users.name as author_name,
        conversation_messages.text,
        conversation_messages.previews,
        conversation_messages.created_at
      from conversation_messages
      join app_users on app_users.email = conversation_messages.author_email
      where conversation_messages.partnership_id = $1
      order by conversation_messages.created_at asc
    `,
    [partnershipId]
  );

  return result.rows.map(toChatMessage);
}

async function getPendingInvitation(
  viewerEmail: string,
  client: Queryable = getPool()
): Promise<PendingInvitation | null> {
  const outgoingResult = await client.query<PendingInvitationRow>(
    `
      select inviter_email, invitee_email
      from partner_invitations
      where inviter_email = $1
      order by created_at desc
      limit 1
    `,
    [normalizeEmail(viewerEmail)]
  );

  if (outgoingResult.rows[0]) {
    return {
      direction: "outgoing",
      email: outgoingResult.rows[0].invitee_email
    };
  }

  const incomingResult = await client.query<PendingInvitationRow>(
    `
      select partner_invitations.inviter_email, partner_invitations.invitee_email, app_users.name as inviter_name
      from partner_invitations
      join app_users on app_users.email = partner_invitations.inviter_email
      where partner_invitations.invitee_email = $1
      order by partner_invitations.created_at desc
      limit 1
    `,
    [normalizeEmail(viewerEmail)]
  );

  if (!incomingResult.rows[0]) {
    return null;
  }

  return {
    direction: "incoming",
    email: incomingResult.rows[0].inviter_email,
    inviterName: incomingResult.rows[0].inviter_name
  };
}

export async function getRoom(user: User): Promise<ChatRoom> {
  await ensureDatabase();
  await upsertUser(user);
  const viewerEmail = normalizeEmail(user.email ?? "");

  await syncInvitationAcceptance(viewerEmail);

  const viewer = await getUserByEmail(viewerEmail);

  if (!viewer) {
    throw new Error("Could not load signed-in user.");
  }

  const partnership = await getPartnershipByEmail(viewerEmail);

  if (!partnership) {
    return {
      viewer,
      partner: null,
      invitation: await getPendingInvitation(viewerEmail),
      messages: []
    };
  }

  const partner = await getUserByEmail(getPartnerEmail(partnership, viewerEmail));

  if (!partner) {
    throw new Error("Could not load partner.");
  }

  return {
    viewer,
    partner,
    invitation: null,
    messages: await getMessagesForPartnership(partnership.id)
  };
}

export async function createPartnerInvitation(user: User, partnerEmail: string): Promise<ChatRoom> {
  await ensureDatabase();
  await upsertUser(user);

  const viewerEmail = normalizeEmail(user.email ?? "");
  const normalizedPartnerEmail = normalizeEmail(partnerEmail);

  if (!normalizedPartnerEmail.endsWith("@gmail.com")) {
    throw new Error("Use your partner's Gmail address for Google sign-in.");
  }

  if (viewerEmail === normalizedPartnerEmail) {
    throw new Error("You can't invite yourself.");
  }

  const client = await getPool().connect();

  try {
    await client.query("begin");

    const viewerPartnership = await getPartnershipByEmail(viewerEmail, client);
    if (viewerPartnership) {
      throw new Error("This account is already paired.");
    }

    const partnerPartnership = await getPartnershipByEmail(normalizedPartnerEmail, client);
    if (partnerPartnership) {
      throw new Error("That Gmail account is already paired.");
    }

    const reciprocalInvite = await client.query<PendingInvitationRow>(
      `
        select inviter_email, invitee_email
        from partner_invitations
        where inviter_email = $1 and invitee_email = $2
        limit 1
        for update
      `,
      [normalizedPartnerEmail, viewerEmail]
    );

    if (reciprocalInvite.rows[0]) {
      await createPartnership(viewerEmail, normalizedPartnerEmail, client);
      await client.query("commit");
      return getRoom(user);
    }

    await client.query(
      `
        delete from partner_invitations
        where inviter_email = $1 or invitee_email = $2
      `,
      [viewerEmail, normalizedPartnerEmail]
    );

    await client.query(
      `
        insert into partner_invitations (invitee_email, inviter_email)
        values ($1, $2)
      `,
      [normalizedPartnerEmail, viewerEmail]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return getRoom(user);
}

export async function saveMessage(user: User, text: string): Promise<ChatRoom> {
  await ensureDatabase();
  await upsertUser(user);
  const viewerEmail = normalizeEmail(user.email ?? "");
  const partnership = await getPartnershipByEmail(viewerEmail);

  const previews = await extractLinkPreviews(text);

  if (!partnership) {
    throw new Error("Invite your partner before sending messages.");
  }

  await getPool().query(
    `
      insert into conversation_messages (id, partnership_id, author_email, text, previews)
      values ($1, $2, $3, $4::jsonb)
    `,
    [randomUUID(), partnership.id, viewerEmail, text, JSON.stringify(previews)]
  );

  return getRoom(user);
}
