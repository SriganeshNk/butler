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
    create table if not exists messages (
      id uuid primary key,
      author text not null check (author in ('You', 'Wife')),
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
