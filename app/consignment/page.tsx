"use client";

import { FormEvent, useState } from "react";
import { ClipboardList, LogOut, Package, Save, Send, ShieldCheck, UserRound } from "lucide-react";

type ConsignmentAccount = {
  address: string;
  contactNumber: string;
  customerName: string;
  currentStocks: number;
  salesByDate: ConsignmentSale[];
  soldStocks: number;
};

type ConsignmentSale = {
  date: string;
  quantity: number;
};

type Tab = "orders" | "stocks" | "account";

function getTodayKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date());
}

function normalizeAccount(account: ConsignmentAccount): ConsignmentAccount {
  return {
    ...account,
    address: account.address ?? "",
    contactNumber: account.contactNumber ?? "",
    salesByDate: Array.isArray(account.salesByDate) ? account.salesByDate : [],
    soldStocks: Number(account.soldStocks) || 0,
  };
}

export default function ConsignmentPage() {
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [customerName, setCustomerName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [packs, setPacks] = useState("");
  const [requestDate, setRequestDate] = useState(getTodayKey());
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [account, setAccount] = useState<ConsignmentAccount | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [sellQty, setSellQty] = useState("");
  const [saleDate, setSaleDate] = useState(getTodayKey());
  const [accountStatus, setAccountStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const needsNameSetup = Boolean(account?.customerName.startsWith("Pending "));

  async function loadAccount(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!/^\d{4}$/.test(pinCode)) {
      setAccountStatus("Enter your 4-digit PIN.");
      return;
    }

    setIsLoading(true);
    const response = await fetch(`/api/consignment-accounts?pinCode=${encodeURIComponent(pinCode)}`);
    setIsLoading(false);

    if (!response.ok) {
      setAccountStatus("Invalid name or PIN.");
      return;
    }

    const data = (await response.json()) as { account: ConsignmentAccount };
    const nextAccount = normalizeAccount(data.account);
    setAccount(nextAccount);
    setCustomerName(nextAccount.customerName.startsWith("Pending ") ? "" : nextAccount.customerName);
    setContactNumber(nextAccount.contactNumber);
    setAddress(nextAccount.address);
    setAccountStatus("");
    setStatus("");
  }

  async function saveAccountName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = customerName.trim();
    if (!trimmedName || !/^\d{4}$/.test(pinCode)) {
      setAccountStatus("Enter your account name.");
      return;
    }

    const response = await fetch("/api/consignment-accounts", {
      body: JSON.stringify({
        action: "claim",
        address: address.trim(),
        contactNumber: contactNumber.trim(),
        customerName: trimmedName,
        pinCode,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      setAccountStatus("Unable to save account name.");
      return;
    }

    const data = (await response.json()) as { account: ConsignmentAccount };
    setAccount(normalizeAccount(data.account));
    setAccountStatus("");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = account?.customerName ?? "";
    if (!trimmedName || !/^\d{4}$/.test(pinCode)) {
      setAccountStatus("Login again to edit profile.");
      return;
    }

    const response = await fetch("/api/consignment-accounts", {
      body: JSON.stringify({
        action: "profile",
        address: address.trim(),
        contactNumber: contactNumber.trim(),
        customerName: trimmedName,
        pinCode,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      setAccountStatus("Unable to save profile.");
      return;
    }

    const data = (await response.json()) as { account: ConsignmentAccount };
    setAccount(normalizeAccount(data.account));
    setAccountStatus("Account profile saved.");
  }

  async function updateAccount(action: "receive" | "sell", quantityText: string) {
    const quantity = Number(quantityText);
    const trimmedName = account?.customerName ?? "";
    if (!trimmedName || !/^\d{4}$/.test(pinCode) || !Number.isFinite(quantity) || quantity <= 0) {
      setAccountStatus("Enter a valid quantity.");
      return;
    }

    const response = await fetch("/api/consignment-accounts", {
      body: JSON.stringify({
        action,
        customerName: trimmedName,
        pinCode,
        quantity,
        saleDate,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      setAccountStatus("Unable to update stocks.");
      return;
    }

    const data = (await response.json()) as { account: ConsignmentAccount };
    setAccount(normalizeAccount(data.account));
    setReceiveQty("");
    setSellQty("");
    setSaleDate(getTodayKey());
    setAccountStatus(action === "receive" ? "Stocks received." : "Sales saved.");
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Sending request...");

    const response = await fetch("/api/consignment-orders", {
      body: JSON.stringify({
        customerName: account?.customerName ?? "",
        notes,
        packs: Number(packs),
        pinCode,
        requestDate,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      setStatus("Request failed. Please check the details.");
      return;
    }

    setPacks("");
    setNotes("");
    setStatus("Order request sent.");
  }

  function logout() {
    setAccount(null);
    setCustomerName("");
    setPinCode("");
    setPacks("");
    setNotes("");
    setStatus("");
    setAccountStatus("");
    setContactNumber("");
    setAddress("");
  }

  if (!account) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-50">
        <section className="mx-auto grid min-h-[calc(100vh-40px)] max-w-md content-center gap-5">
          <div className="grid gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-[8px] bg-emerald-300 text-zinc-950">
              <ShieldCheck aria-hidden="true" size={25} />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-300">Consignment App</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal text-white">
                Siomai Login
              </h1>
            </div>
          </div>

          <form
            className="grid gap-4 rounded-[8px] border border-zinc-800 bg-zinc-900 p-4 shadow-xl shadow-black/30"
            onSubmit={loadAccount}
          >
            <label className="grid gap-2">
              <span className="text-sm text-zinc-300">4-digit PIN</span>
              <input
                className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 text-center text-lg font-semibold tracking-[0.35em] outline-none focus:border-emerald-300"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) =>
                  setPinCode(event.target.value.replace(/\D/g, "").slice(0, 4))
                }
                required
                type="password"
                value={pinCode}
              />
            </label>
            <button
              className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-emerald-300 font-semibold text-zinc-950"
              type="submit"
            >
              <ShieldCheck aria-hidden="true" size={18} />
              {isLoading ? "Checking..." : "Login"}
            </button>
            {accountStatus && <p className="text-sm text-zinc-300">{accountStatus}</p>}
          </form>
        </section>
      </main>
    );
  }

  const currentAccount = account;

  if (needsNameSetup) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-50">
        <section className="mx-auto grid min-h-[calc(100vh-40px)] max-w-md content-center gap-5">
          <div>
            <p className="text-sm font-medium text-emerald-300">Account Setup</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-white">
              Create Your Name
            </h1>
          </div>
          <form
            className="grid gap-4 rounded-[8px] border border-zinc-800 bg-zinc-900 p-4 shadow-xl shadow-black/30"
            onSubmit={saveAccountName}
          >
            <label className="grid gap-2">
              <span className="text-sm text-zinc-300">Your name</span>
              <input
                className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-emerald-300"
                onChange={(event) => setCustomerName(event.target.value)}
                required
                value={customerName}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm text-zinc-300">Contact number</span>
              <input
                className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-emerald-300"
                inputMode="tel"
                onChange={(event) => setContactNumber(event.target.value)}
                value={contactNumber}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm text-zinc-300">Address</span>
              <textarea
                className="min-h-24 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-emerald-300"
                onChange={(event) => setAddress(event.target.value)}
                value={address}
              />
            </label>
            <button
              className="h-12 rounded-[8px] bg-emerald-300 font-semibold text-zinc-950"
              type="submit"
            >
              Save Account
            </button>
            {accountStatus && <p className="text-sm text-zinc-300">{accountStatus}</p>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <section className="mx-auto grid min-h-screen max-w-md grid-rows-[auto_1fr_auto] px-3 pb-24 pt-3">
        <header className="sticky top-0 z-10 rounded-[8px] border border-zinc-800 bg-zinc-900/95 p-3 shadow-xl shadow-black/20 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-emerald-300">Consignment</p>
              <h1 className="truncate text-xl font-semibold text-white">
                {currentAccount.customerName}
              </h1>
            </div>
            <button
              className="grid h-10 w-10 place-items-center rounded-[8px] border border-zinc-800 bg-zinc-950 text-zinc-300"
              onClick={logout}
              type="button"
            >
              <LogOut aria-hidden="true" size={18} />
            </button>
          </div>
        </header>

        <section className="mt-3 grid min-h-0 gap-3">
          <div className="min-h-0 rounded-[8px] border border-zinc-800 bg-zinc-900 p-3 shadow-xl shadow-black/20">
          {activeTab === "orders" && (
            <form className="grid gap-4" onSubmit={submitOrder}>
              <div>
                <h2 className="text-lg font-semibold">Request Order</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Send pack request to production.
                </p>
              </div>
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Packs</span>
                <input
                  className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-emerald-300"
                  min="1"
                  onChange={(event) => setPacks(event.target.value)}
                  required
                  type="number"
                  value={packs}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Date Needed</span>
                <input
                  className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-emerald-300"
                  onChange={(event) => setRequestDate(event.target.value)}
                  required
                  type="date"
                  value={requestDate}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Notes</span>
                <textarea
                  className="min-h-24 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-emerald-300"
                  onChange={(event) => setNotes(event.target.value)}
                  value={notes}
                />
              </label>
              <button
                className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-emerald-300 font-semibold text-zinc-950"
                type="submit"
              >
                <Send aria-hidden="true" size={18} />
                Send Request
              </button>
              {status && <p className="text-sm text-zinc-300">{status}</p>}
            </form>
          )}

          {activeTab === "stocks" && (
            <div className="grid gap-4">
              <div>
                <h2 className="text-lg font-semibold">My Stocks</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Track current packs and sales by date.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-sm text-zinc-400">Current</p>
                  <p className="mt-1 text-3xl font-semibold text-white">
                    {currentAccount.currentStocks}
                  </p>
                </div>
                <div className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-sm text-zinc-400">Sales</p>
                  <p className="mt-1 text-3xl font-semibold text-emerald-300">
                    {currentAccount.soldStocks}
                  </p>
                </div>
              </div>
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Receive stocks</span>
                <input
                  className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-emerald-300"
                  min="1"
                  onChange={(event) => setReceiveQty(event.target.value)}
                  type="number"
                  value={receiveQty}
                />
              </label>
              <button
                className="h-12 rounded-[8px] bg-emerald-300 font-semibold text-zinc-950"
                onClick={() => updateAccount("receive", receiveQty)}
                type="button"
              >
                Add Stocks
              </button>
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Sales quantity</span>
                <input
                  className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-emerald-300"
                  min="1"
                  onChange={(event) => setSellQty(event.target.value)}
                  type="number"
                  value={sellQty}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Sales date</span>
                <input
                  className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-emerald-300"
                  onChange={(event) => setSaleDate(event.target.value)}
                  required
                  type="date"
                  value={saleDate}
                />
              </label>
              <button
                className="h-12 rounded-[8px] border border-zinc-700 font-semibold text-zinc-200"
                onClick={() => updateAccount("sell", sellQty)}
                type="button"
              >
                Save Sales
              </button>
              <div className="grid gap-2 border-t border-zinc-800 pt-3">
                <h3 className="font-semibold text-white">Sales by Date</h3>
                {currentAccount.salesByDate.length === 0 && (
                  <p className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-400">
                    No sales recorded yet.
                  </p>
                )}
                {currentAccount.salesByDate.map((sale) => (
                  <div
                    className="flex items-center justify-between rounded-[8px] border border-zinc-800 bg-zinc-950 px-3 py-2"
                    key={sale.date}
                  >
                    <span className="text-sm text-zinc-300">{sale.date}</span>
                    <span className="font-semibold text-emerald-300">{sale.quantity}</span>
                  </div>
                ))}
              </div>
              {accountStatus && <p className="text-sm text-zinc-300">{accountStatus}</p>}
            </div>
          )}

          {activeTab === "account" && (
            <form className="grid gap-4" onSubmit={saveProfile}>
              <div>
                <h2 className="text-lg font-semibold">Account</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Keep your contact details updated for production.
                </p>
              </div>
              <div className="grid gap-1 rounded-[8px] border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                <p className="font-semibold text-white">{currentAccount.customerName}</p>
                <p>{currentAccount.contactNumber || "No contact number"}</p>
                <p className="text-zinc-500">{currentAccount.address || "No address"}</p>
              </div>
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Contact number</span>
                <input
                  className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-emerald-300"
                  inputMode="tel"
                  onChange={(event) => setContactNumber(event.target.value)}
                  value={contactNumber}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Address</span>
                <textarea
                  className="min-h-24 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-emerald-300"
                  onChange={(event) => setAddress(event.target.value)}
                  value={address}
                />
              </label>
              <button
                className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-emerald-300 font-semibold text-zinc-950"
                type="submit"
              >
                <Save aria-hidden="true" size={18} />
                Save Account
              </button>
              {accountStatus && <p className="text-sm text-zinc-300">{accountStatus}</p>}
            </form>
          )}
          </div>
        </section>
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 px-3 pb-3 pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          {[
            { icon: ClipboardList, id: "orders" as const, label: "Orders" },
            { icon: Package, id: "stocks" as const, label: "Stocks" },
            { icon: UserRound, id: "account" as const, label: "Account" },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                className={`flex h-12 items-center justify-center gap-2 rounded-[8px] text-sm font-semibold ${
                  isActive
                    ? "bg-emerald-300 text-zinc-950"
                    : "border border-zinc-800 bg-zinc-900 text-zinc-300"
                }`}
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
