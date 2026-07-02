import { Pool } from "pg";

export const runtime = "nodejs";

type ConsignmentAccount = {
  address: string;
  contactNumber: string;
  customerName: string;
  currentStocks: number;
  pinCode?: string;
  salesByDate: ConsignmentSale[];
  soldStocks: number;
  updatedAt: string;
};

type ConsignmentSale = {
  date: string;
  quantity: number;
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
      contact_number text not null default '',
      address text not null default '',
      current_stocks integer not null default 0,
      sold_stocks integer not null default 0,
      sales_by_date jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    alter table siomai_consignment_accounts
    add column if not exists pin_code text
  `);
  await pool.query(`
    alter table siomai_consignment_accounts
    add column if not exists contact_number text not null default ''
  `);
  await pool.query(`
    alter table siomai_consignment_accounts
    add column if not exists address text not null default ''
  `);
  await pool.query(`
    alter table siomai_consignment_accounts
    add column if not exists sales_by_date jsonb not null default '[]'::jsonb
  `);
}

function toAccount(row: {
  address?: string | null;
  contact_number?: string | null;
  customer_name: string;
  current_stocks: number;
  pin_code?: string | null;
  sales_by_date?: ConsignmentSale[] | null;
  sold_stocks: number;
  updated_at: Date;
}, includePin = false): ConsignmentAccount {
  const salesByDate = normalizeSalesByDate(row.sales_by_date);
  const salesTotal =
    salesByDate.length > 0
      ? salesByDate.reduce((total, sale) => total + sale.quantity, 0)
      : row.sold_stocks;

  return {
    address: row.address ?? "",
    contactNumber: row.contact_number ?? "",
    currentStocks: row.current_stocks,
    customerName: row.customer_name,
    ...(includePin ? { pinCode: row.pin_code ?? "" } : {}),
    salesByDate,
    soldStocks: salesTotal,
    updatedAt: row.updated_at.toISOString(),
  };
}

function normalizeSalesByDate(value: unknown): ConsignmentSale[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((sale) => ({
      date: String((sale as ConsignmentSale).date ?? ""),
      quantity: Number((sale as ConsignmentSale).quantity),
    }))
    .filter(
      (sale) => /^\d{4}-\d{2}-\d{2}$/.test(sale.date) && Number.isFinite(sale.quantity) && sale.quantity > 0,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
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
      , contact_number, address, sales_by_date
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
        select customer_name, pin_code, contact_number, address, current_stocks, sold_stocks, sales_by_date, updated_at
        from siomai_consignment_accounts
        where lower(customer_name) = lower($1) and pin_code = $2
      `
      : `
        select customer_name, pin_code, contact_number, address, current_stocks, sold_stocks, sales_by_date, updated_at
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
    action?: "claim" | "create" | "profile" | "receive" | "sell";
    address?: string;
    contactNumber?: string;
    customerName?: string;
    pinCode?: string;
    quantity?: number;
    saleDate?: string;
  };
  const address = String(body.address ?? "").trim();
  const contactNumber = String(body.contactNumber ?? "").trim();
  const customerName = String(body.customerName ?? "").trim();
  const pinCode = String(body.pinCode ?? "").trim();
  const quantity = Number(body.quantity);
  const saleDate = String(body.saleDate ?? "").trim();

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
        returning customer_name, pin_code, contact_number, address, current_stocks, sold_stocks, sales_by_date, updated_at
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
            contact_number = $3,
            address = $4,
            updated_at = now()
        where pin_code = $1
        returning customer_name, pin_code, contact_number, address, current_stocks, sold_stocks, sales_by_date, updated_at
      `,
      [pinCode, customerName, contactNumber, address],
    );

    return Response.json({ account: toAccount(result.rows[0]) });
  }

  if (body.action === "profile") {
    if (!customerName || !isValidPin(pinCode)) {
      return Response.json({ error: "Invalid account profile." }, { status: 400 });
    }

    const result = await pool.query(
      `
        update siomai_consignment_accounts
        set contact_number = $3,
            address = $4,
            updated_at = now()
        where lower(customer_name) = lower($1) and pin_code = $2
        returning customer_name, pin_code, contact_number, address, current_stocks, sold_stocks, sales_by_date, updated_at
      `,
      [customerName, pinCode, contactNumber, address],
    );

    if (result.rowCount === 0) {
      return Response.json({ error: "Invalid name or PIN." }, { status: 401 });
    }

    return Response.json({ account: toAccount(result.rows[0]) });
  }

  if (body.action !== "receive" && body.action !== "sell") {
    return Response.json({ error: "Invalid account update." }, { status: 400 });
  }

  if (!customerName || !isValidPin(pinCode) || !Number.isFinite(quantity) || quantity <= 0) {
    return Response.json({ error: "Invalid account update." }, { status: 400 });
  }

  if (body.action === "sell" && saleDate && !/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
    return Response.json({ error: "Invalid sales date." }, { status: 400 });
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
        returning customer_name, pin_code, contact_number, address, current_stocks, sold_stocks, sales_by_date, updated_at
      `
      : `
        update siomai_consignment_accounts
        set current_stocks = greatest(0, current_stocks - $2),
            sold_stocks = sold_stocks + least(current_stocks, $2),
            sales_by_date = (
              select jsonb_agg(sale order by sale->>'date' desc)
              from (
                select jsonb_build_object(
                  'date',
                  coalesce(existing.sale->>'date', $4),
                  'quantity',
                  case
                    when existing.sale is null then least(siomai_consignment_accounts.current_stocks, $2)
                    else (existing.sale->>'quantity')::integer + least(siomai_consignment_accounts.current_stocks, $2)
                  end
                ) as sale
                from (select jsonb_array_elements(sales_by_date) as sale) existing
                where existing.sale->>'date' <> $4
                union all
                select jsonb_build_object(
                  'date',
                  $4,
                  'quantity',
                  coalesce(
                    (
                      select (sale->>'quantity')::integer
                      from jsonb_array_elements(sales_by_date) sale
                      where sale->>'date' = $4
                      limit 1
                    ),
                    0
                  ) + least(siomai_consignment_accounts.current_stocks, $2)
                )
              ) sales
            ),
            updated_at = now()
        where lower(customer_name) = lower($1) and pin_code = $3
        returning customer_name, pin_code, contact_number, address, current_stocks, sold_stocks, sales_by_date, updated_at
      `,
    body.action === "receive" ? [customerName, quantity, pinCode] : [customerName, quantity, pinCode, saleDate || new Date().toISOString().slice(0, 10)],
  );

  return Response.json({ account: toAccount(result.rows[0]) });
}
