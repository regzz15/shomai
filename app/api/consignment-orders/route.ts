import { Pool } from "pg";
import webPush, { PushSubscription } from "web-push";

export const runtime = "nodejs";

type OrderStatus = "pending" | "accepted" | "done";

type ConsignmentOrder = {
  id: string;
  customerName: string;
  packs: number;
  requestDate: string;
  notes: string;
  status: OrderStatus;
  createdAt: string;
};

type PushSubscriptionRow = {
  endpoint: string;
  subscription: PushSubscription;
};

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL;

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
    create table if not exists siomai_consignment_orders (
      id uuid primary key default gen_random_uuid(),
      customer_name text not null,
      packs integer not null,
      request_date text not null,
      notes text not null default '',
      status text not null default 'pending',
      created_at timestamptz not null default now()
    )
  `);
}

async function ensurePushSubscriptionTable() {
  await pool.query(`
    create table if not exists siomai_push_subscriptions (
      endpoint text primary key,
      subscription jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

async function ensureAccountTable() {
  await pool.query(`
    create table if not exists siomai_consignment_accounts (
      customer_name text primary key,
      pin_code text,
      current_stocks integer not null default 0,
      sold_stocks integer not null default 0,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    alter table siomai_consignment_accounts
    add column if not exists pin_code text
  `);
}

function toOrder(row: {
  id: string;
  customer_name: string;
  packs: number;
  request_date: string;
  notes: string;
  status: OrderStatus;
  created_at: Date;
}): ConsignmentOrder {
  return {
    createdAt: row.created_at.toISOString(),
    customerName: row.customer_name,
    id: row.id,
    notes: row.notes,
    packs: row.packs,
    requestDate: row.request_date,
    status: row.status,
  };
}

async function sendOrderPushNotification(order: ConsignmentOrder) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    return;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  await ensurePushSubscriptionTable();

  const result = await pool.query<PushSubscriptionRow>(`
    select endpoint, subscription
    from siomai_push_subscriptions
  `);

  const payload = JSON.stringify({
    body: `${order.customerName} requested ${order.packs} packs for ${order.requestDate}.`,
    tag: `consignment-order-${order.id}`,
    title: "New consignment order",
    url: "/?tab=orders",
  });

  await Promise.allSettled(
    result.rows.map(async (row) => {
      try {
        await webPush.sendNotification(row.subscription, payload);
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await pool.query(
            `
              delete from siomai_push_subscriptions
              where endpoint = $1
            `,
            [row.endpoint],
          );
        }
      }
    }),
  );
}

export async function GET() {
  if (!connectionString) {
    return Response.json(
      { error: "Missing Supabase Postgres connection string." },
      { status: 500 },
    );
  }

  await ensureTable();
  await ensureAccountTable();
  const result = await pool.query(`
    select id, customer_name, packs, request_date, notes, status, created_at
    from siomai_consignment_orders
    order by created_at desc
  `);

  return Response.json({ orders: result.rows.map(toOrder) });
}

export async function POST(request: Request) {
  if (!connectionString) {
    return Response.json(
      { error: "Missing Supabase Postgres connection string." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as Partial<ConsignmentOrder>;
  const customerName = String(body.customerName ?? "").trim();
  const pinCode = String((body as { pinCode?: string }).pinCode ?? "").trim();
  const packs = Number(body.packs);
  const requestDate = String(body.requestDate ?? "").trim();
  const notes = String(body.notes ?? "").trim();

  if (
    !customerName ||
    !/^\d{4}$/.test(pinCode) ||
    !Number.isFinite(packs) ||
    packs <= 0 ||
    !requestDate
  ) {
    return Response.json({ error: "Invalid order request." }, { status: 400 });
  }

  await ensureTable();
  const accountCheck = await pool.query(
    `
      select customer_name
      from siomai_consignment_accounts
      where lower(customer_name) = lower($1) and pin_code = $2
    `,
    [customerName, pinCode],
  );

  if (accountCheck.rowCount === 0) {
    return Response.json({ error: "Invalid name or PIN." }, { status: 401 });
  }

  const result = await pool.query(
    `
      insert into siomai_consignment_orders
        (customer_name, packs, request_date, notes)
      values ($1, $2, $3, $4)
      returning id, customer_name, packs, request_date, notes, status, created_at
    `,
    [customerName, packs, requestDate, notes],
  );

  const order = toOrder(result.rows[0]);
  void sendOrderPushNotification(order);

  return Response.json({ order });
}

export async function PATCH(request: Request) {
  if (!connectionString) {
    return Response.json(
      { error: "Missing Supabase Postgres connection string." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as { id?: string; status?: OrderStatus };
  if (
    !body.id ||
    !body.status ||
    !["pending", "accepted", "done"].includes(body.status)
  ) {
    return Response.json({ error: "Invalid order update." }, { status: 400 });
  }

  await ensureTable();
  const result = await pool.query(
    `
      update siomai_consignment_orders
      set status = $2
      where id = $1
      returning id, customer_name, packs, request_date, notes, status, created_at
    `,
    [body.id, body.status],
  );

  return Response.json({ order: toOrder(result.rows[0]) });
}
