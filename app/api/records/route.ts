import { Pool } from "pg";

export const runtime = "nodejs";

type StockRelease = {
  id: string;
  orderType?: "consignment" | "regular";
  paymentStatus?: "paid" | "partial" | "not_paid";
  quantity: number;
  takenBy: string;
  time: string;
};

type ProductionRecord = {
  date: string;
  startingStocks: number;
  productionAdded: number;
  releases: StockRelease[];
  endingStocks: number;
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
    create table if not exists shomai_daily_records (
      date text primary key,
      starting_stocks integer not null,
      production_added integer not null default 0,
      releases jsonb not null default '[]'::jsonb,
      ending_stocks integer not null,
      updated_at timestamptz not null default now()
    )
  `);
}

function toRecord(row: {
  date: string;
  starting_stocks: number;
  production_added: number;
  releases: StockRelease[];
  ending_stocks: number;
}): ProductionRecord {
  return {
    date: row.date,
    endingStocks: row.ending_stocks,
    productionAdded: row.production_added,
    releases: Array.isArray(row.releases) ? row.releases : [],
    startingStocks: row.starting_stocks,
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
  const result = await pool.query(`
    select date, starting_stocks, production_added, releases, ending_stocks
    from shomai_daily_records
    order by date desc
  `);

  return Response.json({ records: result.rows.map(toRecord) });
}

export async function POST(request: Request) {
  if (!connectionString) {
    return Response.json(
      { error: "Missing Supabase Postgres connection string." },
      { status: 500 },
    );
  }

  const record = (await request.json()) as ProductionRecord;
  await ensureTable();

  await pool.query(
    `
      insert into shomai_daily_records
        (date, starting_stocks, production_added, releases, ending_stocks)
      values ($1, $2, $3, $4::jsonb, $5)
      on conflict (date) do update set
        starting_stocks = excluded.starting_stocks,
        production_added = excluded.production_added,
        releases = excluded.releases,
        ending_stocks = excluded.ending_stocks,
        updated_at = now()
    `,
    [
      record.date,
      record.startingStocks,
      record.productionAdded,
      JSON.stringify(record.releases ?? []),
      record.endingStocks,
    ],
  );

  return Response.json({ record });
}

export async function DELETE() {
  if (!connectionString) {
    return Response.json(
      { error: "Missing Supabase Postgres connection string." },
      { status: 500 },
    );
  }

  await ensureTable();
  await pool.query(`truncate table shomai_daily_records`);

  return Response.json({ ok: true });
}
