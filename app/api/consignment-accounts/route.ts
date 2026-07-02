import { Pool } from "pg";

export const runtime = "nodejs";

type ConsignmentAccount = {
  customerName: string;
  currentStocks: number;
  pinCode?: string;
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

function toAccount(row: {
  customer_name: string;
  current_stocks: number;
  pin_code?: string | null;
  sold_stocks: number;
  updated_at: Date;
}, includePin = false): ConsignmentAccount {
  return {
    currentStocks: row.current_stocks,
    customerName: row.customer_name,
    ...(includePin ? { pinCode: row.pin_code ?? "" } : {}),
    soldStocks: row.sold_stocks,
    updatedAt: row.updated_at.toISOString(),
  };
}

function isValidPin(pinCode: string) {
  return /^\d{4}$/.test(pinCode);
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
  const pinCode = searchParams.get("pinCode")?.trim();

  await ensureTable();

  if (!customerName) {
    const result = await pool.query(`
      select customer_name, pin_code, current_stocks, sold_stocks, updated_at
      from siomai_consignment_accounts
      order by updated_at desc
    `);

    return Response.json({ accounts: result.rows.map((row) => toAccount(row, true)) });
  }

  if (!pinCode || !isValidPin(pinCode)) {
    return Response.json({ error: "Missing or invalid PIN." }, { status: 401 });
  }

  const result = await pool.query(
    `
      select customer_name, pin_code, current_stocks, sold_stocks, updated_at
      from siomai_consignment_accounts
      where lower(customer_name) = lower($1) and pin_code = $2
    `,
    [customerName, pinCode],
  );

  if (result.rowCount === 0) {
    return Response.json({ error: "Invalid name or PIN." }, { status: 401 });
  }

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
    action?: "create" | "receive" | "sell";
    customerName?: string;
    pinCode?: string;
    quantity?: number;
  };
  const customerName = String(body.customerName ?? "").trim();
  const pinCode = String(body.pinCode ?? "").trim();
  const quantity = Number(body.quantity);

  if (!customerName || !body.action) {
    return Response.json({ error: "Invalid account update." }, { status: 400 });
  }

  await ensureTable();

  if (body.action === "create") {
    if (!isValidPin(pinCode)) {
      return Response.json({ error: "PIN must be 4 digits." }, { status: 400 });
    }

    const result = await pool.query(
      `
        insert into siomai_consignment_accounts (customer_name, pin_code)
        values ($1, $2)
        on conflict (customer_name) do update
        set pin_code = excluded.pin_code,
            updated_at = now()
        returning customer_name, pin_code, current_stocks, sold_stocks, updated_at
      `,
      [customerName, pinCode],
    );

    return Response.json({ account: toAccount(result.rows[0], true) });
  }

  if (!isValidPin(pinCode) || !Number.isFinite(quantity) || quantity <= 0) {
    return Response.json({ error: "Invalid account update." }, { status: 400 });
  }

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
    body.action === "receive"
      ? `
        update siomai_consignment_accounts
        set current_stocks = current_stocks + $2,
            updated_at = now()
        where lower(customer_name) = lower($1) and pin_code = $3
        returning customer_name, pin_code, current_stocks, sold_stocks, updated_at
      `
      : `
        update siomai_consignment_accounts
        set current_stocks = greatest(0, current_stocks - $2),
            sold_stocks = sold_stocks + least(current_stocks, $2),
            updated_at = now()
        where lower(customer_name) = lower($1) and pin_code = $3
        returning customer_name, pin_code, current_stocks, sold_stocks, updated_at
      `,
    [customerName, quantity, pinCode],
  );

  return Response.json({ account: toAccount(result.rows[0]) });
}
