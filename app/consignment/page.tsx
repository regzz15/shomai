"use client";

import { FormEvent, useState } from "react";

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
      </section>
    </main>
  );
}
