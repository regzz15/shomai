import { Pool } from "pg";

export const runtime = "nodejs";

type PushSubscriptionBody = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    auth?: string;
    p256dh?: string;
  };
};

const connectionString =
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_URL_NON_POOLING;

function getConnectionString() {
  if (!connectionString) {
    return undefined;
  }

  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return url.toString();
}

const pool = new Pool({
  connectionString: getConnectionString(),
  ssl: { rejectUnauthorized: false },
});

async function ensureTable() {
  await pool.query(`
    create table if not exists siomai_push_subscriptions (
      endpoint text primary key,
      subscription jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  return Response.json({ publicKey });
}

export async function POST(request: Request) {
  if (!connectionString) {
    return Response.json(
      { error: "Missing Supabase Postgres connection string." },
      { status: 500 },
    );
  }

  const subscription = (await request.json()) as PushSubscriptionBody;
  if (
    !subscription.endpoint ||
    !subscription.keys?.auth ||
    !subscription.keys?.p256dh
  ) {
    return Response.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  await ensureTable();
  await pool.query(
    `
      insert into siomai_push_subscriptions (endpoint, subscription)
      values ($1, $2::jsonb)
      on conflict (endpoint) do update set
        subscription = excluded.subscription,
        updated_at = now()
    `,
    [subscription.endpoint, JSON.stringify(subscription)],
  );

  return Response.json({ ok: true });
}
