// src/utils/analytics.js
import SubscriptionCharge from "../models/SubscriptionCharge.js";
import Invoice from "../models/Invoice.js";
import LedgerEntry from "../models/LedgerEntry.js";
import ProviderBalance from "../models/ProviderBalance.js";
import mongoose from "mongoose";

const safeNum = (n) => (Number.isFinite(n) ? n : 0);

/* -------------------------------------------------------
   Helper: Get start-of-day / start-of-month timestamps
------------------------------------------------------- */
const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

/* -------------------------------------------------------
   Main analytics builder
   This gets called by: subscriptions, invoices, terminal,
   and billing cron after successful payments.
------------------------------------------------------- */
export const buildProviderAnalytics = async (providerId) => {
  if (!mongoose.Types.ObjectId.isValid(providerId)) {
    return {};
  }

  const today = startOfDay();
  const monthStart = startOfMonth();
  const last30 = daysAgo(30);

  /* -------------------------------------------------------
     1) PROVIDER BALANCE (pending + available)
  ------------------------------------------------------- */
  const balance = await ProviderBalance.findOne({ provider: providerId });

  /* -------------------------------------------------------
     2) TODAY’S GROSS REVENUE (from ledger)
  ------------------------------------------------------- */
  const ledgerToday = await LedgerEntry.aggregate([
    {
      $match: {
        provider: new mongoose.Types.ObjectId(providerId),
        effectiveAt: { $gte: today },
      },
    },
    {
      $group: {
        _id: null,
        grossToday: { $sum: "$grossAmountCents" },
        netToday: { $sum: "$netAmountCents" },
        feesToday: { $sum: "$feeAmountCents" },
      },
    },
  ]);

  const todayGross = safeNum(ledgerToday?.[0]?.grossToday || 0);
  const todayNet = safeNum(ledgerToday?.[0]?.netToday || 0);
  const todayFees = safeNum(ledgerToday?.[0]?.feesToday || 0);

  /* -------------------------------------------------------
     3) MONTH-TO-DATE REVENUE
  ------------------------------------------------------- */
  const ledgerMTD = await LedgerEntry.aggregate([
    {
      $match: {
        provider: new mongoose.Types.ObjectId(providerId),
        effectiveAt: { $gte: monthStart },
      },
    },
    {
      $group: {
        _id: null,
        grossMonth: { $sum: "$grossAmountCents" },
        netMonth: { $sum: "$netAmountCents" },
        feesMonth: { $sum: "$feeAmountCents" },
      },
    },
  ]);

  const monthGross = safeNum(ledgerMTD?.[0]?.grossMonth || 0);
  const monthNet = safeNum(ledgerMTD?.[0]?.netMonth || 0);
  const monthFees = safeNum(ledgerMTD?.[0]?.feesMonth || 0);

  /* -------------------------------------------------------
     4) LAST 30 DAYS CHART
  ------------------------------------------------------- */
  const ledger30 = await LedgerEntry.aggregate([
    {
      $match: {
        provider: new mongoose.Types.ObjectId(providerId),
        effectiveAt: { $gte: last30 },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$effectiveAt" },
          month: { $month: "$effectiveAt" },
          day: { $dayOfMonth: "$effectiveAt" },
        },
        gross: { $sum: "$grossAmountCents" },
        net: { $sum: "$netAmountCents" },
      },
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
    },
  ]);

  const chart30 = ledger30.map((d) => ({
    date: `${d._id.year}-${String(d._id.month).padStart(2, "0")}-${String(
      d._id.day
    ).padStart(2, "0")}`,
    gross: d.gross,
    net: d.net,
  }));

  /* -------------------------------------------------------
     5) INVOICE vs SUBSCRIPTION revenue breakdown
  ------------------------------------------------------- */
  const invoicePaid = await Invoice.aggregate([
    {
      $match: {
        provider: new mongoose.Types.ObjectId(providerId),
        status: "PAID",
        updatedAt: { $gte: monthStart },
      },
    },
    {
      $group: { _id: null, total: { $sum: "$total" } },
    },
  ]);

  const invoiceMTD = safeNum(invoicePaid?.[0]?.total || 0);

  const subsPaid = await SubscriptionCharge.aggregate([
    {
      $match: {
        provider: new mongoose.Types.ObjectId(providerId),
        createdAt: { $gte: monthStart },
        status: "paid",
      },
    },
    {
      $group: { _id: null, total: { $sum: "$amount" } },
    },
  ]);

  const subsMTD = safeNum(subsPaid?.[0]?.total || 0);

  /* -------------------------------------------------------
     FINAL STRUCTURED ANALYTICS PAYLOAD
  ------------------------------------------------------- */
  return {
    balance: {
      pending: safeNum(balance?.pendingAmountCents || 0),
      available: safeNum(balance?.availableAmountCents || 0),
    },

    today: {
      gross: todayGross,
      net: todayNet,
      fees: todayFees,
    },

    month: {
      gross: monthGross,
      net: monthNet,
      fees: monthFees,
    },

    breakdown: {
      subscriptionRevenue: subsMTD,
      invoiceRevenue: invoiceMTD,
    },

    chart30: chart30, // array of {date, gross, net}
  };
};
