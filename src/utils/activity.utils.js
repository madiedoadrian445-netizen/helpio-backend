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

/* ---------- Ledger ---------- */

exports.normalizeLedgerEntry = (entry) => {
  const createdAt = entry.createdAt || new Date();
  const isCredit = entry.type === "credit";

  return {
    id: entry._id.toString(),
    category: isCredit ? "payment" : "payout",
    title: isCredit ? "Payment received" : "Payout sent",
    message: `${entry.description || "Transaction"} • $${formatAmount(entry.amount)}`,
    amount: Number(entry.amount || 0),
    type: entry.type,
    createdAt,
    time: formatTime(createdAt),
  };
};

/* ---------- Invoice ---------- */

exports.normalizeInvoice = (i) => {
  const createdAt = i.createdAt || i.updatedAt || new Date();

  return {
    id: i._id.toString(),
    category: "invoice",
    title: "Invoice paid",
    message: `Invoice #${i.number || i.invoiceNumber || "—"} • $${formatAmount(i.total)}`,
    amount: Number(i.total || 0),
    type: "credit",
    createdAt,
    time: formatTime(createdAt),
  };
};

/* ---------- Client ---------- */

exports.normalizeClient = (c) => {
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
};