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

function getPendingName(pinCode: string) {
  return `Pending ${pinCode}`;
}

function isPendingName(customerName: string) {
  return customerName.startsWith("Pending ");
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

  if (!customerName && !pinCode) {
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
    customerName
      ? `
        select customer_name, pin_code, current_stocks, sold_stocks, updated_at
        from siomai_consignment_accounts
        where lower(customer_name) = lower($1) and pin_code = $2
      `
      : `
        select customer_name, pin_code, current_stocks, sold_stocks, updated_at
        from siomai_consignment_accounts
        where pin_code = $1
      `,
    customerName ? [customerName, pinCode] : [pinCode],
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
    action?: "claim" | "create" | "receive" | "sell";
    customerName?: string;
    pinCode?: string;
    quantity?: number;
  };
  const customerName = String(body.customerName ?? "").trim();
  const pinCode = String(body.pinCode ?? "").trim();
  const quantity = Number(body.quantity);

  if (!body.action) {
    return Response.json({ error: "Invalid account update." }, { status: 400 });
  }

  await ensureTable();

  if (body.action === "create") {
    if (!isValidPin(pinCode)) {
      return Response.json({ error: "PIN must be 4 digits." }, { status: 400 });
    }

    const existingPin = await pool.query(
      `
        select customer_name
        from siomai_consignment_accounts
        where pin_code = $1
      `,
      [pinCode],
    );

    if ((existingPin.rowCount ?? 0) > 0) {
      return Response.json({ error: "PIN already exists." }, { status: 409 });
    }

    const pendingName = customerName || getPendingName(pinCode);
    const result = await pool.query(
      `
        insert into siomai_consignment_accounts (customer_name, pin_code)
        values ($1, $2)
        on conflict (customer_name) do update
        set pin_code = excluded.pin_code,
            updated_at = now()
        returning customer_name, pin_code, current_stocks, sold_stocks, updated_at
      `,
      [pendingName, pinCode],
    );

    return Response.json({ account: toAccount(result.rows[0], true) });
  }

  if (body.action === "claim") {
    if (!customerName || !isValidPin(pinCode)) {
      return Response.json({ error: "Invalid account claim." }, { status: 400 });
    }

    const existingName = await pool.query(
      `
        select customer_name
        from siomai_consignment_accounts
        where lower(customer_name) = lower($1) and pin_code <> $2
      `,
      [customerName, pinCode],
    );

    if ((existingName.rowCount ?? 0) > 0) {
      return Response.json({ error: "Name already exists." }, { status: 409 });
    }

    const currentAccount = await pool.query(
      `
        select customer_name
        from siomai_consignment_accounts
        where pin_code = $1
      `,
      [pinCode],
    );
    const currentName = String(currentAccount.rows[0]?.customer_name ?? "");

    if (!currentName || (!isPendingName(currentName) && currentName.toLowerCase() !== customerName.toLowerCase())) {
      return Response.json({ error: "PIN is already claimed." }, { status: 409 });
    }

    const result = await pool.query(
      `
        update siomai_consignment_accounts
        set customer_name = $2,
            updated_at = now()
        where pin_code = $1
        returning customer_name, pin_code, current_stocks, sold_stocks, updated_at
      `,
      [pinCode, customerName],
    );

    return Response.json({ account: toAccount(result.rows[0]) });
  }

  if (!customerName || !isValidPin(pinCode) || !Number.isFinite(quantity) || quantity <= 0) {
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
