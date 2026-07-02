"use client";

import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  Factory,
  History,
  Home as HomeIcon,
  KeyRound,
  Minus,
  MoreVertical,
  Package,
  Plus,
  ReceiptText,
  RotateCcw,
  Send,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

const initialStocks = 26;
const defaultPiecesPerStock = 30;
const consignmentPrice = 100;
const regularPrice = 150;
const stockStorageKey = "shomai-current-stocks";
const productionStorageKey = "shomai-production-today";
const historyStorageKey = "shomai-production-history";

type Tab = "dashboard" | "production" | "release" | "consignment" | "history";

type ProductionRecord = {
  date: string;
  startingStocks: number;
  productionAdded: number;
  releases: StockRelease[];
  endingStocks: number;
};

type ConsignmentOrder = {
  id: string;
  customerName: string;
  packs: number;
  requestDate: string;
  notes: string;
  status: "pending" | "accepted" | "done";
  createdAt: string;
};

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function sortHistory(history: ProductionRecord[]) {
  return [...history].sort((a, b) => b.date.localeCompare(a.date));
}

function getReleasedTotal(record?: ProductionRecord) {
  return record?.releases.reduce((total, release) => total + release.quantity, 0) ?? 0;
}

function getReleasePrice(orderType: OrderType) {
  return orderType === "consignment" ? consignmentPrice : regularPrice;
}

function getReleaseSales(release: StockRelease) {
  return release.quantity * getReleasePrice(release.orderType);
}

function getRecordSales(record?: ProductionRecord) {
  return record?.releases.reduce((total, release) => total + getReleaseSales(release), 0) ?? 0;
}

function getConsignmentSalesForDate(account: ConsignmentAccount, date: string) {
  return account.salesByDate?.find((sale) => sale.date === date)?.quantity ?? 0;
}

function normalizeConsignmentAccount(account: ConsignmentAccount): ConsignmentAccount {
  return {
    ...account,
    address: account.address ?? "",
    contactNumber: account.contactNumber ?? "",
    salesByDate: Array.isArray(account.salesByDate) ? account.salesByDate : [],
    soldStocks: Number(account.soldStocks) || 0,
  };
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export default function Home() {
  const todayKey = getTodayKey();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [currentStocks, setCurrentStocks] = useState(initialStocks);
  const [productionToday, setProductionToday] = useState(0);
  const [productionInput, setProductionInput] = useState("");
  const [correctionInput, setCorrectionInput] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);
  const [releaseInput, setReleaseInput] = useState("");
  const [releaseName, setReleaseName] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("regular");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("not_paid");
  const [entryDate, setEntryDate] = useState(todayKey);
  const [history, setHistory] = useState<ProductionRecord[]>([]);
  const [consignmentOrders, setConsignmentOrders] = useState<ConsignmentOrder[]>([]);
  const [consignmentAccounts, setConsignmentAccounts] = useState<ConsignmentAccount[]>([]);
  const [newConsignmentPin, setNewConsignmentPin] = useState("");
  const [consignmentPinStatus, setConsignmentPinStatus] = useState("");
  const [openConsignmentMenu, setOpenConsignmentMenu] = useState("");
  const [showOrders, setShowOrders] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState("Notifications off");
  const [syncStatus, setSyncStatus] = useState("Loading database");
  const [piecesPerStock, setPiecesPerStock] = useState(defaultPiecesPerStock);
  const [reviewDate, setReviewDate] = useState(todayKey);
  const [reportDate, setReportDate] = useState(todayKey);
  const [reportMonth, setReportMonth] = useState(todayKey.slice(0, 7));
  const [reportYear, setReportYear] = useState(todayKey.slice(0, 4));
  const productionDate = formatDisplayDate(todayKey);
  const activeTitle =
    activeTab === "dashboard"
      ? "Dashboard"
      : activeTab === "production"
        ? "Production"
        : activeTab === "release"
          ? "Release & Sales"
          : activeTab === "consignment"
            ? "Consignment"
            : "History";
  const reviewedRecord = history.find((record) => record.date === reviewDate);
  const reportDayRecord = history.find((record) => record.date === reportDate);
  const recentHistory = useMemo(() => sortHistory(history).slice(0, 5), [history]);
  const releasedToday = getReleasedTotal(history.find((record) => record.date === todayKey));
  const reviewedReleased = getReleasedTotal(reviewedRecord);
  const currentPieces = currentStocks * piecesPerStock;
  const productionPiecesToday = productionToday * piecesPerStock;
  const releasedPiecesToday = releasedToday * piecesPerStock;
  const monthlyRecords = history.filter((record) => record.date.startsWith(reportMonth));
  const yearlyRecords = history.filter((record) => record.date.startsWith(reportYear));
  const dailySales = getRecordSales(reportDayRecord);
  const monthlySales = monthlyRecords.reduce(
    (total, record) => total + getRecordSales(record),
    0,
  );
  const yearlySales = yearlyRecords.reduce(
    (total, record) => total + getRecordSales(record),
    0,
  );
  const monthlyReleased = monthlyRecords.reduce(
    (total, record) => total + getReleasedTotal(record),
    0,
  );
  const yearlyReleased = yearlyRecords.reduce(
    (total, record) => total + getReleasedTotal(record),
    0,
  );
  const pendingConsignmentOrders = consignmentOrders.filter(
    (order) => order.status === "pending",
  );
  const consignmentStocksTotal = consignmentAccounts.reduce(
    (total, account) => total + account.currentStocks,
    0,
  );
  const consignmentSalesToday = consignmentAccounts.reduce(
    (total, account) => total + getConsignmentSalesForDate(account, todayKey),
    0,
  );
  const consignmentStockRows = useMemo(
    () =>
      [...consignmentAccounts].sort((a, b) => {
        const stockDifference = b.currentStocks - a.currentStocks;
        return stockDifference || a.customerName.localeCompare(b.customerName);
      }),
    [consignmentAccounts],
  );
  const knownOrderIdsRef = useRef<Set<string> | null>(null);

  function updateOrderType(nextOrderType: OrderType) {
    setOrderType(nextOrderType);

    if (nextOrderType === "consignment") {
      setPaymentStatus("not_paid");
    }
  }

  function getStartingStocksForDate(date: string) {
    const previousRecord = sortHistory(history)
      .filter((record) => record.date < date)
      .at(0);

    return previousRecord?.endingStocks ?? initialStocks;
  }

  // localStorage hydration needs to update client state after mount.
  useEffect(() => {
    loadRecords();
    loadConfig();
    loadConsignmentOrders();
    loadConsignmentAccounts();
    // loadRecords is intentionally scoped to the current todayKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);

  useEffect(() => {
    if (!("Notification" in window)) {
      setNotificationStatus("Notifications unavailable");
      return;
    }

    setNotificationStatus(
      Notification.permission === "granted"
        ? "Notifications on"
        : Notification.permission === "denied"
          ? "Notifications blocked"
          : "Notifications off",
    );
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadConsignmentOrders();
    }, 30000);

    return () => window.clearInterval(interval);
    // loadConsignmentOrders intentionally handles its own current refs/state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestOrderNotifications() {
    try {
      if (!("Notification" in window)) {
        setNotificationStatus("Notifications unavailable");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotificationStatus(
          permission === "denied" ? "Notifications blocked" : "Notifications off",
        );
        return;
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setNotificationStatus("Push unavailable");
        return;
      }

      setNotificationStatus("Saving notifications");
      const registration = await navigator.serviceWorker.ready;
      const keyResponse = await fetch("/api/push-subscriptions");
      const keyData = (await keyResponse.json()) as { publicKey?: string };
      if (!keyData.publicKey) {
        setNotificationStatus("Missing VAPID key");
        return;
      }

      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
          userVisibleOnly: true,
        }));

      const saveResponse = await fetch("/api/push-subscriptions", {
        body: JSON.stringify(subscription),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      setNotificationStatus(
        saveResponse.ok ? "Notifications on" : "Push save failed",
      );
    } catch {
      setNotificationStatus("Push setup failed");
    }
  }

  function notifyNewPendingOrders(orders: ConsignmentOrder[]) {
    const pendingOrders = orders.filter((order) => order.status === "pending");
    const knownOrderIds = knownOrderIdsRef.current;
    knownOrderIdsRef.current = new Set(orders.map((order) => order.id));

    if (!knownOrderIds || !("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const newPendingOrders = pendingOrders.filter((order) => !knownOrderIds.has(order.id));
    const newestOrder = newPendingOrders[0];
    if (!newestOrder) {
      return;
    }

    const title = "New consignment order";
    const body = `${newestOrder.customerName} requested ${newestOrder.packs} packs for ${newestOrder.requestDate}.`;

    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        body,
        tag: `consignment-order-${newestOrder.id}`,
        title,
        type: "SHOW_ORDER_NOTIFICATION",
      });
      return;
    }

    new Notification(title, {
      body,
      icon: "/icon.svg",
      tag: `consignment-order-${newestOrder.id}`,
    });
  }

  async function loadConsignmentOrders() {
    try {
      const response = await fetch("/api/consignment-orders");
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { orders: ConsignmentOrder[] };
      const nextOrders = data.orders ?? [];
      notifyNewPendingOrders(nextOrders);
      setConsignmentOrders(nextOrders);
    } catch {
      setConsignmentOrders([]);
    }
  }

  async function loadConsignmentAccounts() {
    try {
      const response = await fetch("/api/consignment-accounts");
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { accounts: ConsignmentAccount[] };
      setConsignmentAccounts((data.accounts ?? []).map(normalizeConsignmentAccount));
    } catch {
      setConsignmentAccounts([]);
    }
  }

  async function updateConsignmentOrder(
    id: string,
    status: ConsignmentOrder["status"],
  ) {
    const response = await fetch("/api/consignment-orders", {
      body: JSON.stringify({ id, status }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    if (response.ok) {
      await loadConsignmentOrders();
    }
  }

  function generatePin() {
    setNewConsignmentPin(String(Math.floor(1000 + Math.random() * 9000)));
    setConsignmentPinStatus("");
  }

  async function saveConsignmentPin() {
    if (!/^\d{4}$/.test(newConsignmentPin)) {
      setConsignmentPinStatus("Generate a 4-digit PIN first.");
      return;
    }

    const response = await fetch("/api/consignment-accounts", {
      body: JSON.stringify({
        action: "create",
        pinCode: newConsignmentPin,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      setConsignmentPinStatus("Unable to save PIN.");
      return;
    }

    setConsignmentPinStatus(`PIN ${newConsignmentPin} is ready for consignee login.`);
    setNewConsignmentPin("");
    await loadConsignmentAccounts();
  }

  async function removeConsignmentPin(customerName: string) {
    setOpenConsignmentMenu("");
    const response = await fetch("/api/consignment-accounts", {
      body: JSON.stringify({
        action: "remove_pin",
        customerName,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (response.ok) {
      await loadConsignmentAccounts();
    }
  }

  async function deleteConsignmentAccount(customerName: string) {
    setOpenConsignmentMenu("");
    const shouldDelete = window.confirm(`Delete consignment account "${customerName}"?`);
    if (!shouldDelete) {
      return;
    }

    const response = await fetch("/api/consignment-accounts", {
      body: JSON.stringify({
        action: "delete",
        customerName,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (response.ok) {
      await loadConsignmentAccounts();
    }
  }

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
    savedRecord: ProductionRecord,
  ) {
    const sortedHistory = sortHistory(nextHistory);
    const todayRecord = sortedHistory.find((record) => record.date === todayKey);

    setIsSaving(true);
    setHistory(sortedHistory);
    setCurrentStocks(todayRecord?.endingStocks ?? savedRecord.endingStocks);
    setProductionToday(todayRecord?.productionAdded ?? 0);
    window.localStorage.setItem(
      stockStorageKey,
      String(todayRecord?.endingStocks ?? savedRecord.endingStocks),
    );
    window.localStorage.setItem(
      productionStorageKey,
      String(todayRecord?.productionAdded ?? 0),
    );
    window.localStorage.setItem(historyStorageKey, JSON.stringify(sortedHistory));
    setSyncStatus("Saving");

    try {
      const response = await fetch("/api/records", {
        body: JSON.stringify(savedRecord),
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

  async function updateProductionForDate(date: string, delta: number) {
    const existingRecord = history.find((record) => record.date === date);
    const startingStocks =
      existingRecord?.startingStocks ?? getStartingStocksForDate(date);
    const nextProductionToday = Math.max(
      0,
      (existingRecord?.productionAdded ?? 0) + delta,
    );
    const nextRecord: ProductionRecord = {
      date,
      endingStocks:
        startingStocks + nextProductionToday - getReleasedTotal(existingRecord),
      productionAdded: nextProductionToday,
      releases: existingRecord?.releases ?? [],
      startingStocks,
    };
    const nextHistory = [
      nextRecord,
      ...history.filter((record) => record.date !== date),
    ];

    await saveState(nextHistory, nextRecord);
    setReviewDate(date);
  }

  function addProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const quantity = Number(productionInput);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    void updateProductionForDate(entryDate, quantity);
    setProductionInput("");
  }

  function correctProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const quantity = Number(correctionInput);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    void updateProductionForDate(entryDate, -quantity);
    setCorrectionInput("");
  }

  function resetToday() {
    const existingRecord = history.find((record) => record.date === entryDate);
    const startingStocks =
      existingRecord?.startingStocks ?? getStartingStocksForDate(entryDate);
    const nextRecord: ProductionRecord = {
      date: entryDate,
      endingStocks: startingStocks,
      productionAdded: 0,
      releases: [],
      startingStocks,
    };

    void saveState(
      [nextRecord, ...history.filter((record) => record.date !== entryDate)],
      nextRecord,
    );
    setReviewDate(entryDate);
  }

  function releaseStocks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const quantity = Number(releaseInput);
    const takenBy = releaseName.trim();
    if (!takenBy || !Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    const existingRecord = history.find((record) => record.date === entryDate);
    const startingStocks =
      existingRecord?.startingStocks ?? getStartingStocksForDate(entryDate);
    const baseRecord: ProductionRecord = existingRecord ?? {
      date: entryDate,
      endingStocks: startingStocks,
      productionAdded: 0,
      releases: [],
      startingStocks,
    };
    const allowedQuantity = Math.min(quantity, baseRecord.endingStocks);
    if (allowedQuantity <= 0) {
      return;
    }

    const nextRelease: StockRelease = {
      id: `${Date.now()}`,
      orderType,
      paymentStatus: orderType === "consignment" ? "not_paid" : paymentStatus,
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
      [nextRecord, ...history.filter((record) => record.date !== entryDate)],
      nextRecord,
    );
    setReleaseInput("");
    setReleaseName("");
    setOrderType("regular");
    setPaymentStatus("not_paid");
    setReviewDate(entryDate);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto grid min-h-screen w-full max-w-7xl grid-rows-[auto_1fr] gap-3 px-3 pb-24 pt-3 sm:px-6 sm:pb-6 lg:px-8">
        <header className="sticky top-0 z-20 rounded-[8px] border border-zinc-800 bg-zinc-900/95 px-4 py-3 shadow-xl shadow-black/20 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-emerald-300 text-zinc-950">
                <Factory aria-hidden="true" size={22} />
              </div>
              <div>
                <p className="text-xs font-medium text-emerald-300">
                  {activeTitle}
                </p>
                <h1 className="text-xl font-semibold tracking-normal text-white">
                  Siomai
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="relative grid h-10 w-10 place-items-center rounded-[8px] border border-zinc-800 bg-zinc-950 text-zinc-300"
                onClick={() => setShowOrders((current) => !current)}
                type="button"
              >
                <Bell aria-hidden="true" size={18} />
                {pendingConsignmentOrders.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                    {pendingConsignmentOrders.length}
                  </span>
                )}
              </button>
              <div className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
                {formatDisplayDate(todayKey)}
              </div>
            </div>
          </div>
        </header>

        <section className="min-h-0 rounded-[8px] border border-zinc-800 bg-zinc-900 p-3 shadow-xl shadow-black/20 sm:p-6">
          {showOrders && (
            <section className="fixed inset-x-3 top-[76px] z-40 mx-auto max-h-[calc(100vh-120px)] max-w-2xl overflow-y-auto rounded-[8px] border border-zinc-800 bg-zinc-950 p-4 shadow-2xl shadow-black/50 sm:top-[88px]">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-white">Pending Requests</h2>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-[8px] border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200"
                    onClick={() => void requestOrderNotifications()}
                    type="button"
                  >
                    {notificationStatus}
                  </button>
                  <button
                    className="text-sm text-emerald-300"
                    onClick={() => {
                      void loadConsignmentOrders();
                      void loadConsignmentAccounts();
                    }}
                    type="button"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <div className="grid gap-2">
                {consignmentOrders.length === 0 && (
                  <p className="text-sm text-zinc-400">No requests yet.</p>
                )}
                {consignmentOrders.slice(0, 8).map((order) => (
                  <article
                    className="rounded-[8px] border border-zinc-800 bg-zinc-900 p-3"
                    key={order.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">
                          {order.customerName}
                        </p>
                        <p className="text-sm text-zinc-400">
                          {order.packs} packs - {formatDisplayDate(order.requestDate)}
                        </p>
                        {order.notes && (
                          <p className="mt-1 text-sm text-zinc-300">{order.notes}</p>
                        )}
                      </div>
                      <span className="rounded-[8px] border border-zinc-700 px-2 py-1 text-xs text-zinc-300">
                        {order.status}
                      </span>
                    </div>
                    {order.status === "pending" && (
                      <button
                        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-emerald-300 font-semibold text-zinc-950"
                        onClick={() => updateConsignmentOrder(order.id, "accepted")}
                        type="button"
                      >
                        <Check aria-hidden="true" size={16} />
                        Accept
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          <div className="mb-3 flex items-center justify-between gap-3 rounded-[8px] border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 sm:text-sm">
            <span>{syncStatus}</span>
            {isSaving && <span className="text-emerald-300">Saving...</span>}
          </div>
          {activeTab === "dashboard" && (
            <div className="grid gap-3">
              <section className="grid gap-3 rounded-[8px] border border-zinc-800 bg-zinc-950 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
                <div>
                  <div className="flex items-center gap-2 text-zinc-300">
                    <CalendarDays aria-hidden="true" size={18} />
                    <p className="text-sm font-medium">{productionDate}</p>
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    Production Overview
                  </h2>
                </div>
                <button
                  className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-zinc-700 px-4 text-sm font-semibold text-zinc-200"
                  onClick={() => setShowOrders(true)}
                  type="button"
                >
                  <Bell aria-hidden="true" size={17} />
                  {pendingConsignmentOrders.length} pending
                </button>
              </section>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard icon={Package} label="Stocks" value={currentStocks} />
                <MetricCard icon={Package} label="Pieces" tone="emerald" value={currentPieces} />
                <MetricCard icon={Factory} label="Made" value={productionToday} />
                <MetricCard icon={Send} label="Released" value={releasedToday} />
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <Panel icon={Factory} title="Today">
                  <div className="grid grid-cols-2 gap-2">
                    <SmallMetric label="Made pcs" tone="emerald" value={productionPiecesToday} />
                    <SmallMetric label="Out pcs" value={releasedPiecesToday} />
                  </div>
                </Panel>
                <Panel icon={UserRound} title="Consignment">
                  <div className="grid grid-cols-2 gap-2">
                    <SmallMetric label="Stocks" tone="emerald" value={consignmentStocksTotal} />
                    <SmallMetric label="Sales" value={consignmentSalesToday} />
                  </div>
                </Panel>
                <Panel icon={ReceiptText} title="Sales">
                  <div className="grid grid-cols-2 gap-2">
                    <SmallMetric label="Daily" tone="emerald" value={`PHP ${dailySales}`} />
                    <SmallMetric label="Month" value={`PHP ${monthlySales}`} />
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {activeTab === "production" && (
            <div className="grid gap-3">
              <Panel icon={Plus} title="Add Production">
                <form className="grid gap-4" onSubmit={addProduction}>
                  <DateField
                    label="Entry Date"
                    onChange={setEntryDate}
                    todayKey={todayKey}
                    value={entryDate}
                  />
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

              <section className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
                <button
                  className="flex h-12 w-full items-center justify-between rounded-[8px] border border-zinc-800 bg-zinc-900 px-4 text-left font-semibold text-zinc-200 transition-colors hover:bg-zinc-800"
                  onClick={() => setShowCorrection((current) => !current)}
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    <RotateCcw aria-hidden="true" size={18} />
                    Correction
                  </span>
                  <span className="text-xs text-zinc-500">
                    {showCorrection ? "Hide" : "Open"}
                  </span>
                </button>

                {showCorrection && (
                  <form
                    className="mt-4 grid gap-4 border-t border-zinc-800 pt-4"
                    onSubmit={correctProduction}
                  >
                    <DateField
                      label="Entry Date"
                      onChange={setEntryDate}
                      todayKey={todayKey}
                      value={entryDate}
                    />
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
                        aria-label="Reset selected date"
                        className="flex h-12 items-center justify-center gap-2 rounded-[8px] border border-red-900/80 px-4 font-semibold text-red-200 transition-colors hover:bg-red-950/40"
                        onClick={resetToday}
                        title="Reset selected date"
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" size={18} />
                        Reset
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>
          )}

          {activeTab === "release" && (
            <div className="grid gap-3">
              <section className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
                <h2 className="text-xl font-semibold text-white">Release & Sales</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Record outgoing stocks first, then review sales totals below.
                </p>
              </section>
              <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                <Panel icon={Send} title="Release Stocks">
                  <form className="grid gap-4" onSubmit={releaseStocks}>
                    <DateField
                      label="Entry Date"
                      onChange={setEntryDate}
                      todayKey={todayKey}
                      value={entryDate}
                    />
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
                          updateOrderType(event.target.value as OrderType)
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
                        className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-900 px-4 text-base text-white outline-none transition-colors focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={orderType === "consignment"}
                        onChange={(event) =>
                          setPaymentStatus(event.target.value as PaymentStatus)
                        }
                        value={orderType === "consignment" ? "not_paid" : paymentStatus}
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

              <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
                <Panel icon={ReceiptText} title="Sales Reports">
                  <div className="grid gap-4">
                    <DateField
                      label="Daily Sales Date"
                      onChange={setReportDate}
                      todayKey={todayKey}
                      value={reportDate}
                    />
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-zinc-300">
                        Month
                      </span>
                      <input
                        className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-900 px-4 text-base text-white outline-none transition-colors focus:border-emerald-300"
                        onChange={(event) => setReportMonth(event.target.value)}
                        type="month"
                        value={reportMonth}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-zinc-300">
                        Year
                      </span>
                      <input
                        className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-900 px-4 text-base text-white outline-none transition-colors focus:border-emerald-300"
                        onChange={(event) => setReportYear(event.target.value)}
                        type="number"
                        value={reportYear}
                      />
                    </label>
                  </div>
                </Panel>

                <Panel icon={BarChart3} title="Sales Summary">
                  <div className="grid gap-3">
                    <SmallMetric
                      label="Daily sales"
                      tone="emerald"
                      value={`PHP ${dailySales}`}
                    />
                    <SmallMetric
                      label="Monthly sales"
                      tone="emerald"
                      value={`PHP ${monthlySales}`}
                    />
                    <SmallMetric
                      label="Yearly sales"
                      tone="emerald"
                      value={`PHP ${yearlySales}`}
                    />
                    <SmallMetric label="Month released" value={monthlyReleased} />
                    <SmallMetric label="Year released" value={yearlyReleased} />
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {activeTab === "consignment" && (
            <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
              <Panel icon={KeyRound} title="Generate PIN">
                <div className="grid gap-4">
                  <div className="rounded-[8px] border border-zinc-800 bg-zinc-900 p-4">
                    <p className="text-sm text-zinc-400">New consignee PIN</p>
                    <p className="mt-2 text-4xl font-semibold tracking-[0.25em] text-emerald-300">
                      {newConsignmentPin || "----"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="h-12 rounded-[8px] border border-zinc-700 font-semibold text-zinc-200"
                      onClick={generatePin}
                      type="button"
                    >
                      Generate
                    </button>
                    <button
                      className="h-12 rounded-[8px] bg-emerald-300 font-semibold text-zinc-950"
                      onClick={() => void saveConsignmentPin()}
                      type="button"
                    >
                      Save PIN
                    </button>
                  </div>
                  {consignmentPinStatus && (
                    <p className="text-sm text-zinc-300">{consignmentPinStatus}</p>
                  )}
                </div>
              </Panel>

              <Panel icon={UserRound} title="Consignment Stocks">
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <SmallMetric label="Accounts" value={consignmentAccounts.length} />
                    <SmallMetric
                      label="Stocks"
                      tone="emerald"
                      value={consignmentStocksTotal}
                    />
                    <SmallMetric label="Pieces" value={consignmentStocksTotal * piecesPerStock} />
                    <SmallMetric label="Sales today" value={consignmentSalesToday} />
                  </div>
                  <button
                    className="h-11 rounded-[8px] border border-zinc-700 font-semibold text-zinc-200"
                    onClick={() => void loadConsignmentAccounts()}
                    type="button"
                  >
                    Refresh
                  </button>
                  <div className="grid gap-2">
                    {consignmentStockRows.length === 0 && (
                      <p className="rounded-[8px] border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-400">
                        No consignment accounts yet.
                      </p>
                    )}
                    {consignmentStockRows.map((account) => (
                      <article
                        className="relative rounded-[8px] border border-zinc-800 bg-zinc-900 p-3"
                        key={account.pinCode || account.customerName}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold text-white">
                              {account.customerName.startsWith("Pending ")
                                ? "Waiting for account name"
                                : account.customerName}
                            </h3>
                            <p className="mt-1 text-xs text-zinc-500">
                              PIN {account.pinCode || "----"} - {formatDateTime(account.updatedAt)}
                            </p>
                            {(account.contactNumber || account.address) && (
                              <p className="mt-1 text-xs text-zinc-400">
                                {[account.contactNumber, account.address].filter(Boolean).join(" - ")}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-[8px] bg-emerald-300 px-3 py-1 text-sm font-semibold text-zinc-950">
                              {account.currentStocks}
                            </span>
                            <button
                              aria-label="Account actions"
                              className="grid h-8 w-8 place-items-center rounded-[8px] border border-zinc-700 text-zinc-300"
                              onClick={() =>
                                setOpenConsignmentMenu((current) =>
                                  current === account.customerName ? "" : account.customerName,
                                )
                              }
                              type="button"
                            >
                              <MoreVertical aria-hidden="true" size={17} />
                            </button>
                          </div>
                        </div>
                        {openConsignmentMenu === account.customerName && (
                          <div className="absolute right-3 top-12 z-10 grid w-44 gap-1 rounded-[8px] border border-zinc-700 bg-zinc-950 p-2 shadow-xl shadow-black/40">
                            <button
                              className="h-10 rounded-[8px] px-3 text-left text-sm font-semibold text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!account.pinCode}
                              onClick={() => void removeConsignmentPin(account.customerName)}
                              type="button"
                            >
                              Remove PIN
                            </button>
                            <button
                              className="h-10 rounded-[8px] px-3 text-left text-sm font-semibold text-red-200 hover:bg-red-950/40"
                              onClick={() => void deleteConsignmentAccount(account.customerName)}
                              type="button"
                            >
                              Delete Account
                            </button>
                          </div>
                        )}
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <SmallMetric label="Stocks" value={account.currentStocks} />
                          <SmallMetric
                            label="Pieces"
                            tone="emerald"
                            value={account.currentStocks * piecesPerStock}
                          />
                          <SmallMetric label="Sales today" value={getConsignmentSalesForDate(account, todayKey)} />
                        </div>
                        {account.salesByDate.length > 0 && (
                          <div className="mt-3 grid gap-2 border-t border-zinc-800 pt-3">
                            {account.salesByDate.slice(0, 5).map((sale) => (
                              <div
                                className="flex items-center justify-between rounded-[8px] bg-zinc-950 px-3 py-2 text-sm"
                                key={sale.date}
                              >
                                <span className="text-zinc-400">{formatDisplayDate(sale.date)}</span>
                                <span className="font-semibold text-emerald-300">{sale.quantity}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              </Panel>
            </div>
          )}

          {activeTab === "history" && (
            <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
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
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

function BottomNav({
  activeTab,
  setActiveTab,
}: {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}) {
  const items = [
    { icon: HomeIcon, id: "dashboard" as Tab, label: "Dashboard" },
    { icon: Plus, id: "production" as Tab, label: "Produce" },
    { icon: Send, id: "release" as Tab, label: "Sales" },
    { icon: UserRound, id: "consignment" as Tab, label: "Consign" },
    { icon: History, id: "history" as Tab, label: "History" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 shadow-2xl shadow-black/40 backdrop-blur sm:sticky sm:bottom-auto sm:mx-auto sm:mb-4 sm:max-w-3xl sm:rounded-[8px] sm:border">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = activeTab === item.id;

          return (
            <button
              aria-label={item.label}
              className={`grid h-14 min-w-0 place-items-center rounded-[8px] px-1 text-[10px] font-medium transition-colors sm:text-xs ${
                selected
                  ? "bg-emerald-300 text-zinc-950"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={20} />
              <span className="mt-1 max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
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
    <div className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">{label}</p>
        <Icon className={tone === "emerald" ? "text-emerald-300" : "text-zinc-500"} size={18} />
      </div>
      <p className={`mt-3 text-3xl font-semibold sm:text-4xl ${tone === "emerald" ? "text-emerald-300" : "text-white"}`}>
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
    <section className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
      <div className="mb-5 flex items-center gap-2 border-b border-zinc-800 pb-4">
        <Icon aria-hidden="true" className="text-emerald-300" size={20} />
        <h2 className="text-lg font-semibold text-white sm:text-xl">{title}</h2>
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

function DateField({
  label,
  onChange,
  todayKey,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  todayKey: string;
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-900 px-4 text-base text-white outline-none transition-colors focus:border-emerald-300"
          onChange={(event) => onChange(event.target.value)}
          type="date"
          value={value}
        />
        <button
          className="h-12 rounded-[8px] border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-900"
          onClick={() => onChange(todayKey)}
          type="button"
        >
          Today
        </button>
      </div>
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
    <div className="rounded-[8px] border border-zinc-800 bg-zinc-900 p-3 sm:p-4">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold sm:text-2xl ${tone === "emerald" ? "text-emerald-300" : "text-white"}`}>
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
                <p className="text-xs font-medium text-emerald-300">
                  PHP {getReleaseSales(release)}
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
