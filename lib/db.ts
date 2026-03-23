import { Pool, type PoolClient } from "pg";

let pool: Pool | null = null;
let initializationPromise: Promise<void> | null = null;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      ssl:
        process.env.NODE_ENV === "production"
          ? {
              rejectUnauthorized: false
            }
          : false
    });
  }

  return pool;
}

async function createSchema(client: PoolClient) {
  await client.query(`
    create table if not exists app_users (
      email text primary key,
      name text not null,
      image text,
      created_at timestamptz not null default now()
    );

    create table if not exists partnerships (
      id uuid primary key,
      user_one_email text not null references app_users(email) on delete cascade,
      user_two_email text not null references app_users(email) on delete cascade,
      created_at timestamptz not null default now(),
      constraint partnerships_distinct_users check (user_one_email <> user_two_email),
      constraint partnerships_ordered_users check (user_one_email < user_two_email),
      unique (user_one_email),
      unique (user_two_email)
    );

    create table if not exists partner_invitations (
      invitee_email text primary key,
      inviter_email text not null references app_users(email) on delete cascade,
      created_at timestamptz not null default now(),
      constraint partner_invitations_distinct_users check (invitee_email <> inviter_email)
    );

    create table if not exists conversation_messages (
      id uuid primary key,
      partnership_id uuid not null references partnerships(id) on delete cascade,
      author_email text not null references app_users(email) on delete cascade,
      text text not null,
      previews jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
}

export async function ensureDatabase() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const client = await getPool().connect();

      try {
        await createSchema(client);
      } finally {
        client.release();
      }
    })();
  }

  return initializationPromise;
}
