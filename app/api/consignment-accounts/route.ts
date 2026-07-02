import { Pool } from "pg";

export const runtime = "nodejs";

type ConsignmentAccount = {
  customerName: string;
  currentStocks: number;
  soldStocks: number;
  updatedAt: string;
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
    create table if not exists siomai_consignment_accounts (
      customer_name text primary key,
      current_stocks integer not null default 0,
      sold_stocks integer not null default 0,
      updated_at timestamptz not null default now()
    )
  `);
}

function toAccount(row: {
  customer_name: string;
  current_stocks: number;
  sold_stocks: number;
  updated_at: Date;
}): ConsignmentAccount {
  return {
    currentStocks: row.current_stocks,
    customerName: row.customer_name,
    soldStocks: row.sold_stocks,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function GET(request: Request) {
  if (!connectionString) {
    return Response.json(
      { error: "Missing Supabase Postgres connection string." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const customerName = searchParams.get("customerName")?.trim();

  if (!customerName) {
    return Response.json({ error: "Missing customer name." }, { status: 400 });
  }

  await ensureTable();
  const result = await pool.query(
    `
      insert into siomai_consignment_accounts (customer_name)
      values ($1)
      on conflict (customer_name) do update set customer_name = excluded.customer_name
      returning customer_name, current_stocks, sold_stocks, updated_at
    `,
    [customerName],
  );

  return Response.json({ account: toAccount(result.rows[0]) });
}

export async function POST(request: Request) {
  if (!connectionString) {
    return Response.json(
      { error: "Missing Supabase Postgres connection string." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    action?: "receive" | "sell";
    customerName?: string;
    quantity?: number;
  };
  const customerName = String(body.customerName ?? "").trim();
  const quantity = Number(body.quantity);

  if (
    !customerName ||
    !body.action ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return Response.json({ error: "Invalid account update." }, { status: 400 });
  }

  await ensureTable();
  await pool.query(
    `
      insert into siomai_consignment_accounts (customer_name)
      values ($1)
      on conflict (customer_name) do nothing
    `,
    [customerName],
  );

  const result = await pool.query(
    body.action === "receive"
      ? `
        update siomai_consignment_accounts
        set current_stocks = current_stocks + $2,
            updated_at = now()
        where customer_name = $1
        returning customer_name, current_stocks, sold_stocks, updated_at
      `
      : `
        update siomai_consignment_accounts
        set current_stocks = greatest(0, current_stocks - $2),
            sold_stocks = sold_stocks + least(current_stocks, $2),
            updated_at = now()
        where customer_name = $1
        returning customer_name, current_stocks, sold_stocks, updated_at
      `,
    [customerName, quantity],
  );

  return Response.json({ account: toAccount(result.rows[0]) });
}
