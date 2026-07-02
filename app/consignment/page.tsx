"use client";

import { FormEvent, useState } from "react";

type ConsignmentAccount = {
  customerName: string;
  currentStocks: number;
  soldStocks: number;
};

function getTodayKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date());
}

export default function ConsignmentPage() {
  const [customerName, setCustomerName] = useState("");
  const [packs, setPacks] = useState("");
  const [requestDate, setRequestDate] = useState(getTodayKey());
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [account, setAccount] = useState<ConsignmentAccount | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [sellQty, setSellQty] = useState("");
  const [accountStatus, setAccountStatus] = useState("");

  async function loadAccount(name = customerName) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setAccountStatus("Enter your name first.");
      return;
    }

    const response = await fetch(
      `/api/consignment-accounts?customerName=${encodeURIComponent(trimmedName)}`,
    );

    if (!response.ok) {
      setAccountStatus("Unable to load account.");
      return;
    }

    const data = (await response.json()) as { account: ConsignmentAccount };
    setAccount(data.account);
    setAccountStatus("Account loaded.");
  }

  async function updateAccount(action: "receive" | "sell", quantityText: string) {
    const quantity = Number(quantityText);
    const trimmedName = customerName.trim();
    if (!trimmedName || !Number.isFinite(quantity) || quantity <= 0) {
      setAccountStatus("Enter name and quantity.");
      return;
    }

    const response = await fetch("/api/consignment-accounts", {
      body: JSON.stringify({
        action,
        customerName: trimmedName,
        quantity,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      setAccountStatus("Unable to update stocks.");
      return;
    }

    const data = (await response.json()) as { account: ConsignmentAccount };
    setAccount(data.account);
    setReceiveQty("");
    setSellQty("");
    setAccountStatus(action === "receive" ? "Stocks received." : "Sale recorded.");
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Sending request...");

    const response = await fetch("/api/consignment-orders", {
      body: JSON.stringify({
        customerName,
        notes,
        packs: Number(packs),
        requestDate,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      setStatus("Request failed. Please check the details.");
      return;
    }

    setCustomerName("");
    setPacks("");
    setNotes("");
    setStatus("Order request sent.");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-50">
      <section className="mx-auto grid max-w-md gap-5 rounded-[8px] border border-zinc-800 bg-zinc-900 p-5 shadow-xl shadow-black/30">
        <div>
          <p className="text-sm font-medium text-emerald-300">Consignment</p>
          <h1 className="mt-1 text-2xl font-semibold">Siomai Order Request</h1>
        </div>

        <form className="grid gap-4" onSubmit={submitOrder}>
          <label className="grid gap-2">
            <span className="text-sm text-zinc-300">Name</span>
            <input
              className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-emerald-300"
              onChange={(event) => setCustomerName(event.target.value)}
              required
              value={customerName}
            />
          </label>
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
            className="h-12 rounded-[8px] bg-emerald-300 font-semibold text-zinc-950"
            type="submit"
          >
            Send Request
          </button>
        </form>

        {status && <p className="text-sm text-zinc-300">{status}</p>}

        <section className="grid gap-4 border-t border-zinc-800 pt-5">
          <div>
            <h2 className="text-xl font-semibold">My Stocks</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Use the same name above to load and update your consignment stocks.
            </p>
          </div>

          <button
            className="h-11 rounded-[8px] border border-zinc-700 font-semibold text-zinc-200"
            onClick={() => loadAccount()}
            type="button"
          >
            Load My Account
          </button>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-400">Current stocks</p>
              <p className="mt-1 text-3xl font-semibold text-white">
                {account?.currentStocks ?? 0}
              </p>
            </div>
            <div className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-400">Sold</p>
              <p className="mt-1 text-3xl font-semibold text-emerald-300">
                {account?.soldStocks ?? 0}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
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
              Add to My Stocks
            </button>
          </div>

          <div className="grid gap-3">
            <label className="grid gap-2">
              <span className="text-sm text-zinc-300">Record sold packs</span>
              <input
                className="h-12 rounded-[8px] border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-emerald-300"
                min="1"
                onChange={(event) => setSellQty(event.target.value)}
                type="number"
                value={sellQty}
              />
            </label>
            <button
              className="h-12 rounded-[8px] border border-zinc-700 font-semibold text-zinc-200"
              onClick={() => updateAccount("sell", sellQty)}
              type="button"
            >
              Record Sale
            </button>
          </div>

          {accountStatus && (
            <p className="text-sm text-zinc-300">{accountStatus}</p>
          )}
        </section>
      </section>
    </main>
  );
}
