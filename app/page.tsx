"use client";

import {
  BarChart3,
  CalendarDays,
  Factory,
  History,
  Home as HomeIcon,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Send,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

const initialStocks = 26;
const defaultPiecesPerStock = 30;
const stockStorageKey = "shomai-current-stocks";
const productionStorageKey = "shomai-production-today";
const historyStorageKey = "shomai-production-history";

type Tab = "dashboard" | "production" | "release" | "history";

type ProductionRecord = {
  date: string;
  startingStocks: number;
  productionAdded: number;
  releases: StockRelease[];
  endingStocks: number;
};

type StockRelease = {
  id: string;
  orderType: OrderType;
  paymentStatus: PaymentStatus;
  quantity: number;
  takenBy: string;
  time: string;
};

type OrderType = "consignment" | "regular";
type PaymentStatus = "paid" | "partial" | "not_paid";

const orderTypeLabels: Record<OrderType, string> = {
  consignment: "Consignment",
  regular: "Regular Order",
};

const paymentLabels: Record<PaymentStatus, string> = {
  not_paid: "Not Paid",
  paid: "Paid",
  partial: "Partial",
};

function getTodayKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date());
}

function formatDisplayDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Singapore",
  }).format(new Date(`${date}T00:00:00+08:00`));
}

function sortHistory(history: ProductionRecord[]) {
  return [...history].sort((a, b) => b.date.localeCompare(a.date));
}

function getReleasedTotal(record?: ProductionRecord) {
  return record?.releases.reduce((total, release) => total + release.quantity, 0) ?? 0;
}

function normalizeRecord(record: ProductionRecord): ProductionRecord {
  const releases = Array.isArray(record.releases)
    ? record.releases.map((release) => ({
        ...release,
        orderType: release.orderType ?? ("regular" as OrderType),
        paymentStatus: release.paymentStatus ?? ("not_paid" as PaymentStatus),
      }))
    : [];
  const releasedTotal = releases.reduce(
    (total, release) => total + release.quantity,
    0,
  );

  return {
    ...record,
    releases,
    endingStocks: record.startingStocks + record.productionAdded - releasedTotal,
  };
}

export default function Home() {
  const todayKey = getTodayKey();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [currentStocks, setCurrentStocks] = useState(initialStocks);
  const [productionToday, setProductionToday] = useState(0);
  const [productionInput, setProductionInput] = useState("");
  const [correctionInput, setCorrectionInput] = useState("");
  const [releaseInput, setReleaseInput] = useState("");
  const [releaseName, setReleaseName] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("regular");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("not_paid");
  const [history, setHistory] = useState<ProductionRecord[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Loading database");
  const [piecesPerStock, setPiecesPerStock] = useState(defaultPiecesPerStock);
  const [reviewDate, setReviewDate] = useState(todayKey);
  const productionDate = formatDisplayDate(todayKey);
  const reviewedRecord = history.find((record) => record.date === reviewDate);
  const recentHistory = useMemo(() => sortHistory(history).slice(0, 5), [history]);
  const releasedToday = getReleasedTotal(history.find((record) => record.date === todayKey));
  const reviewedReleased = getReleasedTotal(reviewedRecord);
  const currentPieces = currentStocks * piecesPerStock;
  const productionPiecesToday = productionToday * piecesPerStock;
  const releasedPiecesToday = releasedToday * piecesPerStock;

  // localStorage hydration needs to update client state after mount.
  useEffect(() => {
    loadRecords();
    loadConfig();
    // loadRecords is intentionally scoped to the current todayKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);

  async function loadConfig() {
    try {
      const response = await fetch("/api/config");
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { piecesPerStock?: number };
      if (
        Number.isFinite(data.piecesPerStock) &&
        Number(data.piecesPerStock) > 0
      ) {
        setPiecesPerStock(Number(data.piecesPerStock));
      }
    } catch {
      setPiecesPerStock(defaultPiecesPerStock);
    }
  }

  async function loadRecords() {
    try {
      const response = await fetch("/api/records");
      if (!response.ok) {
        throw new Error("Unable to load records.");
      }

      const data = (await response.json()) as { records: ProductionRecord[] };
      const nextHistory = sortHistory((data.records ?? []).map(normalizeRecord));
      const todayRecord = nextHistory.find((record) => record.date === todayKey);

      if (todayRecord) {
        setHistory(nextHistory);
        setCurrentStocks(todayRecord.endingStocks);
        setProductionToday(todayRecord.productionAdded);
        setSyncStatus("Synced");
        return;
      }

      const previousRecord = nextHistory[0];
      const newTodayRecord: ProductionRecord = {
        date: todayKey,
        endingStocks: previousRecord?.endingStocks ?? initialStocks,
        productionAdded: 0,
        releases: [],
        startingStocks: previousRecord?.endingStocks ?? initialStocks,
      };

      await saveState([newTodayRecord, ...nextHistory], newTodayRecord);
    } catch {
      setSyncStatus("Database unavailable");
    }
  }

  async function saveState(
    nextHistory: ProductionRecord[],
    todayRecord: ProductionRecord,
  ) {
    const sortedHistory = sortHistory(nextHistory);

    setIsSaving(true);
    setHistory(sortedHistory);
    setCurrentStocks(todayRecord.endingStocks);
    setProductionToday(todayRecord.productionAdded);
    window.localStorage.setItem(stockStorageKey, String(todayRecord.endingStocks));
    window.localStorage.setItem(
      productionStorageKey,
      String(todayRecord.productionAdded),
    );
    window.localStorage.setItem(historyStorageKey, JSON.stringify(sortedHistory));
    setSyncStatus("Saving");

    try {
      const response = await fetch("/api/records", {
        body: JSON.stringify(todayRecord),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Unable to save record.");
      }
      setSyncStatus("Synced");
    } catch {
      setSyncStatus("Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateTodayProduction(delta: number) {
    const existingToday = history.find((record) => record.date === todayKey);
    const startingStocks = existingToday?.startingStocks ?? currentStocks;
    const nextProductionToday = Math.max(
      0,
      (existingToday?.productionAdded ?? productionToday) + delta,
    );
    const nextRecord: ProductionRecord = {
      date: todayKey,
      endingStocks:
        startingStocks + nextProductionToday - getReleasedTotal(existingToday),
      productionAdded: nextProductionToday,
      releases: existingToday?.releases ?? [],
      startingStocks,
    };
    const nextHistory = [
      nextRecord,
      ...history.filter((record) => record.date !== todayKey),
    ];

    await saveState(nextHistory, nextRecord);
    setReviewDate(todayKey);
  }

  function addProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const quantity = Number(productionInput);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    void updateTodayProduction(quantity);
    setProductionInput("");
  }

  function correctProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const quantity = Number(correctionInput);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    void updateTodayProduction(-quantity);
    setCorrectionInput("");
  }

  function resetToday() {
    const existingToday = history.find((record) => record.date === todayKey);
    const startingStocks = existingToday?.startingStocks ?? initialStocks;
    const nextRecord: ProductionRecord = {
      date: todayKey,
      endingStocks: startingStocks,
      productionAdded: 0,
      releases: [],
      startingStocks,
    };

    void saveState(
      [nextRecord, ...history.filter((record) => record.date !== todayKey)],
      nextRecord,
    );
    setReviewDate(todayKey);
  }

  function releaseStocks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const quantity = Number(releaseInput);
    const takenBy = releaseName.trim();
    if (!takenBy || !Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    const existingToday = history.find((record) => record.date === todayKey);
    const baseRecord: ProductionRecord = existingToday ?? {
      date: todayKey,
      endingStocks: currentStocks,
      productionAdded: 0,
      releases: [],
      startingStocks: currentStocks,
    };
    const allowedQuantity = Math.min(quantity, baseRecord.endingStocks);
    if (allowedQuantity <= 0) {
      return;
    }

    const nextRelease: StockRelease = {
      id: `${Date.now()}`,
      orderType,
      paymentStatus,
      quantity: allowedQuantity,
      takenBy,
      time: new Intl.DateTimeFormat("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Singapore",
      }).format(new Date()),
    };
    const nextRecord = normalizeRecord({
      ...baseRecord,
      releases: [nextRelease, ...baseRecord.releases],
    });

    void saveState(
      [nextRecord, ...history.filter((record) => record.date !== todayKey)],
      nextRecord,
    );
    setReleaseInput("");
    setReleaseName("");
    setOrderType("regular");
    setPaymentStatus("not_paid");
    setReviewDate(todayKey);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto grid min-h-screen w-full max-w-7xl grid-rows-[auto_1fr] gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-[8px] border border-zinc-800 bg-zinc-900 px-4 py-4 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-[8px] bg-emerald-300 text-zinc-950">
                <Factory aria-hidden="true" size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-300">
                  Production
                </p>
                <h1 className="text-2xl font-semibold tracking-normal text-white">
                  Shomai
                </h1>
              </div>
            </div>

            <nav className="grid grid-cols-4 gap-2 rounded-[8px] border border-zinc-800 bg-zinc-950 p-1">
              {[
                { icon: HomeIcon, id: "dashboard" as Tab, label: "Dashboard" },
                { icon: Plus, id: "production" as Tab, label: "Production" },
                { icon: Send, id: "release" as Tab, label: "Release" },
                { icon: History, id: "history" as Tab, label: "History" },
              ].map((item) => {
                const Icon = item.icon;
                const selected = activeTab === item.id;

                return (
                  <button
                    aria-label={item.label}
                    className={`flex h-11 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-medium transition-colors ${
                      selected
                        ? "bg-emerald-300 text-zinc-950"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                    }`}
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={item.label}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={18} />
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </header>

        <section className="min-h-0 rounded-[8px] border border-zinc-800 bg-zinc-900 p-4 shadow-xl shadow-black/20 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[8px] border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
            <span>{syncStatus}</span>
            {isSaving && <span className="text-emerald-300">Saving...</span>}
          </div>
          {activeTab === "dashboard" && (
            <div className="grid h-full gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 lg:content-start">
                <MetricCard icon={Package} label="Stocks Today" value={currentStocks} />
                <MetricCard
                  icon={Package}
                  label="Pieces Today"
                  tone="emerald"
                  value={currentPieces}
                />
                <MetricCard
                  icon={Factory}
                  label="Production Today"
                  value={productionToday}
                />
                <MetricCard icon={UserRound} label="Released Today" value={releasedToday} />
              </div>

              <div className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-5">
                <div className="flex items-center gap-2 text-zinc-300">
                  <CalendarDays aria-hidden="true" size={18} />
                  <p className="text-sm font-medium">{productionDate}</p>
                </div>
                <div className="mt-8 grid gap-3">
                  <div className="grid grid-cols-3 gap-2 rounded-[8px] border border-zinc-800 bg-zinc-900 p-3 text-center">
                    <SmallMetric label="Made pcs" tone="emerald" value={productionPiecesToday} />
                    <SmallMetric label="Out pcs" value={releasedPiecesToday} />
                    <SmallMetric label="Per stock" value={piecesPerStock} />
                  </div>
                  <button
                    aria-label="Open production entry"
                    className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-emerald-300 px-4 font-semibold text-zinc-950 transition-colors hover:bg-emerald-200"
                    onClick={() => setActiveTab("production")}
                    title="Open production entry"
                    type="button"
                  >
                    <Plus aria-hidden="true" size={18} />
                    Add Production
                  </button>
                  <button
                    aria-label="Open history review"
                    className="flex h-12 items-center justify-center gap-2 rounded-[8px] border border-zinc-700 px-4 font-semibold text-zinc-200 transition-colors hover:bg-zinc-900"
                    onClick={() => setActiveTab("history")}
                    title="Open history review"
                    type="button"
                  >
                    <BarChart3 aria-hidden="true" size={18} />
                    Review History
                  </button>
                  <button
                    aria-label="Open release stocks"
                    className="flex h-12 items-center justify-center gap-2 rounded-[8px] border border-zinc-700 px-4 font-semibold text-zinc-200 transition-colors hover:bg-zinc-900"
                    onClick={() => setActiveTab("release")}
                    title="Open release stocks"
                    type="button"
                  >
                    <Send aria-hidden="true" size={18} />
                    Release Stocks
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "production" && (
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <Panel icon={Plus} title="Add Production">
                <form className="grid gap-4" onSubmit={addProduction}>
                  <NumberField
                    label="Quantity"
                    onChange={setProductionInput}
                    placeholder="Enter quantity"
                    value={productionInput}
                  />
                  <button
                    aria-label="Add production"
                    className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-emerald-300 px-4 font-semibold text-zinc-950 transition-colors hover:bg-emerald-200"
                    title="Add production"
                    type="submit"
                  >
                    <Plus aria-hidden="true" size={18} />
                    Add
                  </button>
                </form>
              </Panel>

              <Panel icon={RotateCcw} title="Correct Input">
                <form className="grid gap-4" onSubmit={correctProduction}>
                  <NumberField
                    label="Subtract Quantity"
                    onChange={setCorrectionInput}
                    placeholder="Enter amount to subtract"
                    value={correctionInput}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      aria-label="Subtract production"
                      className="flex h-12 items-center justify-center gap-2 rounded-[8px] border border-zinc-700 px-4 font-semibold text-zinc-200 transition-colors hover:bg-zinc-900"
                      title="Subtract production"
                      type="submit"
                    >
                      <Minus aria-hidden="true" size={18} />
                      Subtract
                    </button>
                    <button
                      aria-label="Reset today"
                      className="flex h-12 items-center justify-center gap-2 rounded-[8px] border border-red-900/80 px-4 font-semibold text-red-200 transition-colors hover:bg-red-950/40"
                      onClick={resetToday}
                      title="Reset today"
                      type="button"
                    >
                      <RotateCcw aria-hidden="true" size={18} />
                      Reset
                    </button>
                  </div>
                </form>
              </Panel>
            </div>
          )}

          {activeTab === "release" && (
            <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
              <Panel icon={Send} title="Release Stocks">
                <form className="grid gap-4" onSubmit={releaseStocks}>
                  <TextField
                    label="Taken By"
                    onChange={setReleaseName}
                    placeholder="Name"
                    value={releaseName}
                  />
                  <NumberField
                    label="Quantity"
                    onChange={setReleaseInput}
                    placeholder="Enter quantity"
                    value={releaseInput}
                  />
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-zinc-300">
                      Order Type
                    </span>
                    <select
                      className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-900 px-4 text-base text-white outline-none transition-colors focus:border-emerald-300"
                      onChange={(event) =>
                        setOrderType(event.target.value as OrderType)
                      }
                      value={orderType}
                    >
                      <option value="regular">Regular Order</option>
                      <option value="consignment">Consignment</option>
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-zinc-300">
                      Payment Status
                    </span>
                    <select
                      className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-900 px-4 text-base text-white outline-none transition-colors focus:border-emerald-300"
                      onChange={(event) =>
                        setPaymentStatus(event.target.value as PaymentStatus)
                      }
                      value={paymentStatus}
                    >
                      <option value="not_paid">Not Paid</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                    </select>
                  </label>
                  <button
                    aria-label="Release stocks"
                    className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-emerald-300 px-4 font-semibold text-zinc-950 transition-colors hover:bg-emerald-200"
                    title="Release stocks"
                    type="submit"
                  >
                    <Minus aria-hidden="true" size={18} />
                    Release
                  </button>
                </form>
              </Panel>

              <Panel icon={Package} title="Stock Summary">
                <div className="grid gap-3">
                  <SmallMetric label="Available stocks" value={currentStocks} />
                  <SmallMetric
                    label="Available pcs"
                    tone="emerald"
                    value={currentPieces}
                  />
                  <SmallMetric label="Released today" value={releasedToday} />
                  <SmallMetric label="Released pcs" value={releasedPiecesToday} />
                </div>
              </Panel>
            </div>
          )}

          {activeTab === "history" && (
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <Panel icon={CalendarDays} title="Review Date">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-zinc-300">Date</span>
                  <input
                    className="h-11 rounded-[8px] border border-zinc-700 bg-zinc-900 px-3 text-base text-white outline-none transition-colors focus:border-emerald-300"
                    onChange={(event) => setReviewDate(event.target.value)}
                    type="date"
                    value={reviewDate}
                  />
                </label>
                <div className="mt-4 grid gap-3">
                  <SmallMetric label="Starting" value={reviewedRecord?.startingStocks ?? "-"} />
                  <SmallMetric
                    label="Production"
                    tone="emerald"
                    value={reviewedRecord?.productionAdded ?? "-"}
                  />
                  <SmallMetric
                    label="Made pcs"
                    tone="emerald"
                    value={
                      reviewedRecord
                        ? reviewedRecord.productionAdded * piecesPerStock
                        : "-"
                    }
                  />
                  <SmallMetric label="Released" value={reviewedRecord ? reviewedReleased : "-"} />
                  <SmallMetric
                    label="Out pcs"
                    value={reviewedRecord ? reviewedReleased * piecesPerStock : "-"}
                  />
                  <SmallMetric label="Ending" value={reviewedRecord?.endingStocks ?? "-"} />
                </div>
              </Panel>

              <Panel icon={History} title="Recent Days">
                <div className="grid gap-3">
                  {recentHistory.map((record) => (
                    <HistoryCard
                      key={record.date}
                      piecesPerStock={piecesPerStock}
                      record={record}
                    />
                  ))}
                </div>
              </Panel>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof Package;
  label: string;
  tone?: "emerald";
  value: number | string;
}) {
  return (
    <div className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">{label}</p>
        <Icon className={tone === "emerald" ? "text-emerald-300" : "text-zinc-500"} size={18} />
      </div>
      <p className={`mt-4 text-4xl font-semibold ${tone === "emerald" ? "text-emerald-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function Panel({
  children,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  icon: typeof Package;
  title: string;
}) {
  return (
    <section className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-5">
      <div className="mb-5 flex items-center gap-2 border-b border-zinc-800 pb-4">
        <Icon aria-hidden="true" className="text-emerald-300" size={20} />
        <h2 className="text-xl font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function NumberField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-900 px-4 text-base text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-300"
        min="1"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="number"
        value={value}
      />
    </label>
  );
}

function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      <input
        className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-900 px-4 text-base text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-300"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    </label>
  );
}

function SmallMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "emerald";
  value: number | string;
}) {
  return (
    <div className="rounded-[8px] border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "emerald" ? "text-emerald-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function HistoryCard({
  piecesPerStock,
  record,
}: {
  piecesPerStock: number;
  record: ProductionRecord;
}) {
  const releasedTotal = getReleasedTotal(record);
  const madePieces = record.productionAdded * piecesPerStock;
  const releasedPieces = releasedTotal * piecesPerStock;
  const endingPieces = record.endingStocks * piecesPerStock;

  return (
    <article className="rounded-[8px] border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <p className="font-semibold text-white">{formatDisplayDate(record.date)}</p>
        <Package aria-hidden="true" className="text-zinc-500" size={18} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <SmallMetric label="Starting" value={record.startingStocks} />
        <SmallMetric label="Made" tone="emerald" value={record.productionAdded} />
        <SmallMetric label="Released" value={releasedTotal} />
        <SmallMetric label="Ending" value={record.endingStocks} />
        <SmallMetric label="Made pcs" tone="emerald" value={madePieces} />
        <SmallMetric label="Out pcs" value={releasedPieces} />
        <SmallMetric label="Ending pcs" value={endingPieces} />
        <SmallMetric label="Pcs/stock" value={piecesPerStock} />
      </div>
      {record.releases.length > 0 && (
        <div className="mt-4 grid gap-2 border-t border-zinc-800 pt-3">
          {record.releases.map((release) => (
            <div
              className="grid gap-3 rounded-[8px] bg-zinc-950 px-3 py-3 text-sm sm:grid-cols-[1fr_auto]"
              key={release.id}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-200">
                  {release.takenBy}
                </p>
                <p className="text-xs text-zinc-500">
                  {release.time} · {release.quantity * piecesPerStock} pcs ·{" "}
                  {orderTypeLabels[release.orderType]}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <PaymentBadge status={release.paymentStatus} />
                <p className="font-semibold text-red-200">-{release.quantity}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function PaymentBadge({ status }: { status: PaymentStatus }) {
  const className =
    status === "paid"
      ? "border-emerald-800 bg-emerald-950/70 text-emerald-200"
      : status === "partial"
        ? "border-amber-800 bg-amber-950/70 text-amber-200"
        : "border-red-900 bg-red-950/70 text-red-200";

  return (
    <span
      className={`rounded-[8px] border px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {paymentLabels[status]}
    </span>
  );
}
