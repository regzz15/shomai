"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Factory,
  History,
  Home as HomeIcon,
  Minus,
  Package,
  Plus,
  RotateCcw,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

const initialStocks = 26;
const stockStorageKey = "shomai-current-stocks";
const productionStorageKey = "shomai-production-today";
const historyStorageKey = "shomai-production-history";

type Tab = "dashboard" | "production" | "history";

type ProductionRecord = {
  date: string;
  startingStocks: number;
  productionAdded: number;
  endingStocks: number;
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

export default function Home() {
  const todayKey = getTodayKey();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [currentStocks, setCurrentStocks] = useState(initialStocks);
  const [productionToday, setProductionToday] = useState(0);
  const [productionInput, setProductionInput] = useState("");
  const [correctionInput, setCorrectionInput] = useState("");
  const [history, setHistory] = useState<ProductionRecord[]>([]);
  const [reviewDate, setReviewDate] = useState(todayKey);
  const productionDate = formatDisplayDate(todayKey);
  const reviewedRecord = history.find((record) => record.date === reviewDate);
  const recentHistory = useMemo(() => sortHistory(history).slice(0, 5), [history]);

  // localStorage hydration needs to update client state after mount.
  useEffect(() => {
    const savedHistory = window.localStorage.getItem(historyStorageKey);
    const savedStocks = Number(window.localStorage.getItem(stockStorageKey));
    const savedProduction = Number(
      window.localStorage.getItem(productionStorageKey),
    );
    const validSavedStocks =
      Number.isFinite(savedStocks) && savedStocks > 0
        ? savedStocks
        : initialStocks;
    const validSavedProduction =
      Number.isFinite(savedProduction) && savedProduction >= 0
        ? savedProduction
        : 0;

    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory) as ProductionRecord[];
        if (Array.isArray(parsedHistory)) {
          const nextHistory = sortHistory(parsedHistory);
          const todayRecord = nextHistory.find(
            (record) => record.date === todayKey,
          );

          setHistory(nextHistory);
          setCurrentStocks(todayRecord?.endingStocks ?? validSavedStocks);
          setProductionToday(todayRecord?.productionAdded ?? 0);
          return;
        }
      } catch {
        window.localStorage.removeItem(historyStorageKey);
      }
    }

    const migratedRecord: ProductionRecord = {
      date: todayKey,
      endingStocks: validSavedStocks,
      productionAdded: validSavedProduction,
      startingStocks: validSavedStocks - validSavedProduction,
    };
    const nextHistory = [migratedRecord];

    saveState(nextHistory, migratedRecord);
  }, [todayKey]);

  function saveState(nextHistory: ProductionRecord[], todayRecord: ProductionRecord) {
    const sortedHistory = sortHistory(nextHistory);

    setHistory(sortedHistory);
    setCurrentStocks(todayRecord.endingStocks);
    setProductionToday(todayRecord.productionAdded);
    window.localStorage.setItem(stockStorageKey, String(todayRecord.endingStocks));
    window.localStorage.setItem(
      productionStorageKey,
      String(todayRecord.productionAdded),
    );
    window.localStorage.setItem(historyStorageKey, JSON.stringify(sortedHistory));
  }

  function updateTodayProduction(delta: number) {
    const existingToday = history.find((record) => record.date === todayKey);
    const startingStocks = existingToday?.startingStocks ?? currentStocks;
    const nextProductionToday = Math.max(
      0,
      (existingToday?.productionAdded ?? productionToday) + delta,
    );
    const nextRecord: ProductionRecord = {
      date: todayKey,
      endingStocks: startingStocks + nextProductionToday,
      productionAdded: nextProductionToday,
      startingStocks,
    };
    const nextHistory = [
      nextRecord,
      ...history.filter((record) => record.date !== todayKey),
    ];

    saveState(nextHistory, nextRecord);
    setReviewDate(todayKey);
  }

  function addProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const quantity = Number(productionInput);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    updateTodayProduction(quantity);
    setProductionInput("");
  }

  function correctProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const quantity = Number(correctionInput);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    updateTodayProduction(-quantity);
    setCorrectionInput("");
  }

  function resetToday() {
    const existingToday = history.find((record) => record.date === todayKey);
    const startingStocks = existingToday?.startingStocks ?? initialStocks;
    const nextRecord: ProductionRecord = {
      date: todayKey,
      endingStocks: startingStocks,
      productionAdded: 0,
      startingStocks,
    };

    saveState(
      [nextRecord, ...history.filter((record) => record.date !== todayKey)],
      nextRecord,
    );
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

            <nav className="grid grid-cols-3 gap-2 rounded-[8px] border border-zinc-800 bg-zinc-950 p-1">
              {[
                { icon: HomeIcon, id: "dashboard" as Tab, label: "Dashboard" },
                { icon: Plus, id: "production" as Tab, label: "Production" },
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
          {activeTab === "dashboard" && (
            <div className="grid h-full gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="grid gap-4 sm:grid-cols-3 lg:content-start">
                <MetricCard icon={Package} label="Stocks Today" value={currentStocks} />
                <MetricCard
                  icon={Factory}
                  label="Production Today"
                  tone="emerald"
                  value={productionToday}
                />
                <MetricCard icon={CheckCircle2} label="Status" value="Ready" />
              </div>

              <div className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-5">
                <div className="flex items-center gap-2 text-zinc-300">
                  <CalendarDays aria-hidden="true" size={18} />
                  <p className="text-sm font-medium">{productionDate}</p>
                </div>
                <div className="mt-8 grid gap-3">
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
                  <SmallMetric label="Ending" value={reviewedRecord?.endingStocks ?? "-"} />
                </div>
              </Panel>

              <Panel icon={History} title="Recent Days">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                    <thead className="text-zinc-400">
                      <tr className="border-b border-zinc-800">
                        <th className="py-3 pr-4 font-medium">Date</th>
                        <th className="py-3 pr-4 font-medium">Starting</th>
                        <th className="py-3 pr-4 font-medium">Production</th>
                        <th className="py-3 pr-4 font-medium">Ending</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-200">
                      {recentHistory.map((record) => (
                        <tr className="border-b border-zinc-900" key={record.date}>
                          <td className="py-3 pr-4">{formatDisplayDate(record.date)}</td>
                          <td className="py-3 pr-4">{record.startingStocks}</td>
                          <td className="py-3 pr-4 text-emerald-300">
                            {record.productionAdded}
                          </td>
                          <td className="py-3 pr-4">{record.endingStocks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
