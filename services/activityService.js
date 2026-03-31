import Invoice from "../src/models/Invoice.js";
import Customer from "../src/models/Customer.js";
import LedgerEntry from "../src/models/LedgerEntry.js";
/* ---------- Helpers ---------- */

const formatTime = (date) => {
  const now = new Date();
  const diff = now - new Date(date);

  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
};

const formatAmount = (val) => Number(val || 0).toFixed(2);

/* ---------- Service ---------- */

export const getActivityFeed = async (userId, options = {}) => {
  try {
    const { limit = 50 } = options;
const [ledgerEntries, invoices, clients] = await Promise.all([
  LedgerEntry.find({ provider: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean(),

  Invoice.find({ provider: userId, status: "paid" })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean(),

  Customer.find({ provider: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean(),
]);


    /* ---------- Ledger (Payments + Payouts) ---------- */

    const ledgerEvents = ledgerEntries.map((entry) => {
      const createdAt = entry.createdAt || new Date();



return {
  id: entry._id.toString(),
  category: "payment", // 👈 always payment
  title: "Payment received", // 👈 always this label
  message: entry.description || "Transaction",
  amount: Number(entry.amount || 0),
  type: entry.type,
  createdAt,
  time: formatTime(createdAt),
};
    });

    /* ---------- Invoices ---------- */

    const invoiceEvents = invoices.map((i) => {
      const createdAt = i.createdAt || i.updatedAt || new Date();

      return {
        id: i._id.toString(),
        category: "invoice",
        title: "Invoice paid",
        message: `Invoice #${i.number || i.invoiceNumber || "—"}`,
        amount: Number(i.total || 0),
        type: "credit",
        createdAt,
        time: formatTime(createdAt),
      };
    });

    /* ---------- Clients ---------- */

    const clientEvents = clients.map((c) => {
      const createdAt = c.createdAt || new Date();

      return {
        id: c._id.toString(),
        category: "client",
        title: "New client added",
        message: c.name || c.businessName || "Client",
        type: "info",
        createdAt,
        time: formatTime(createdAt),
      };
    });

    /* ---------- Merge + Sort ---------- */

    const all = [
      ...ledgerEvents,
      ...invoiceEvents,
      ...clientEvents,
    ];

    return all
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

  } catch (err) {
    console.error("Activity service error:", err);
    throw new Error("Failed to fetch activity");
  }
};