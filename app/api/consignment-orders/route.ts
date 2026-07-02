import { Pool } from "pg";

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

  return Response.json({ order: toOrder(result.rows[0]) });
}

export async function PATCH(request: Request) {
  if (!connectionString) {
    return Response.json(
      { error: "Missing Supabase Postgres connection string." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as { id?: string; status?: OrderStatus };
  if (!body.id || !body.status) {
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
