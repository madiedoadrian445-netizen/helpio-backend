// src/controllers/invoiceController.js
import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import { CustomerTimeline } from "../models/CustomerTimeline.js";
import Provider from "../models/Provider.js";
import Customer from "../models/Customer.js";
import LedgerEntry from "../models/LedgerEntry.js";
import { calculateFees } from "../utils/feeCalculator.js";
import {
  stripeClient,
  isLiveStripe,
  isSimulatedStripe,
} from "../config/stripe.js";

// IDEMPOTENCY SYSTEM
import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
  markIdempotencyKeyFailed,
} from "../utils/idempotency.js";

// LEDGER ENGINE
import { recordInvoicePaymentLedger } from "../utils/ledger.js";

const safeNum = (n) => {
  const v = parseFloat(n);
  return Number.isNaN(v) ? 0 : v;
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);


const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const parsePositiveInt = (value, defaultValue, max) => {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return defaultValue;
  if (max && n > max) return max;
  return n;
};

const getProviderForUser = async (userId) => {
  if (!userId) return null;
  // Only need _id for access control & references
  return Provider.findOne({ user: userId }).select("_id").lean();
};

/* -------------------------------------------------------
   CREATE INVOICE
------------------------------------------------------- */
export const createInvoice = async (req, res, next) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 404, "Provider profile not found");
    }

    const {
      customer,
      customerId,
      items,
      subtotal,
      tax,
      taxPct,
      total,
      paid,
      balance,
      invoiceNumber,
      issueDate,
      dueDate,
      status,
      notes,
    } = req.body;

    // ✅ Support both customer + customerId
    const customerRef = customer || customerId;

    if (!customerRef || !isValidId(customerRef)) {
      return sendError(res, 400, "Valid customer ID is required");
    }

    // ✅ CORRECT: resolve from Customer collection, provider-scoped
    const client = await Customer.findOne({
      _id: customerRef,
      provider: provider._id,
    }).lean();

    if (!client) {
      return sendError(res, 404, "Customer not found");
    }

    const totalSafe = safeNum(total);
    const paidSafe = safeNum(paid);
    const computedBalance =
      typeof balance === "number"
        ? safeNum(balance)
        : totalSafe - paidSafe;

    const invoice = await Invoice.create({
      provider: provider._id,
      customer: client._id,
      items: Array.isArray(items) ? items : [],
      subtotal: safeNum(subtotal),
      tax: safeNum(tax),
      taxPct: safeNum(taxPct),
      total: totalSafe,
      paid: paidSafe,
      balance: computedBalance < 0 ? 0 : computedBalance,
      invoiceNumber,
      issueDate,
      dueDate,
      status: status || "DUE",
      notes: notes || "",
    });

    // Timeline entry (non-fatal)
    try {
      await CustomerTimeline.create({
        provider: provider._id,
        customer: client._id,
        type: "invoice",
        title: `Invoice ${invoiceNumber || invoice._id} created`,
        description: `Invoice created for $${safeNum(
          invoice.total
        ).toLocaleString("en-US")}`,
        amount: invoice.total,
        invoice: invoice._id,
        createdAt: new Date(),
      });
    } catch {}

    return res.status(201).json({ success: true, invoice });
  } catch (err) {
    console.error("❌ createInvoice error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
   GET INVOICE BY ID
------------------------------------------------------- */
export const getInvoiceById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid invoice ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Unauthorized");

    const invoice = await Invoice.findOne({
      _id: id,
      provider: provider._id,
    })
      .populate("customer")
      .populate("provider")
      .lean();

    if (!invoice) return sendError(res, 404, "Invoice not found");

    return res.json({ success: true, invoice });
  } catch (err) {
    console.error("❌ getInvoiceById error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
   GET PROVIDER INVOICES (Paginated)
------------------------------------------------------- */
export const getInvoicesForProvider = async (req, res, next) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Unauthorized");

    const { page = 1, limit = 20, status, sort = "desc" } = req.query;

    const pageNum = parsePositiveInt(page, 1);
    const limitNum = parsePositiveInt(limit, 20, 100);
    const sortOrder = sort === "asc" ? 1 : -1;

    const filter = { provider: provider._id };
    if (status && typeof status === "string") {
      filter.status = status;
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ createdAt: sortOrder })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      invoices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error("❌ getInvoicesForProvider error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
   GET CUSTOMER INVOICES (Paginated)
------------------------------------------------------- */
export const getInvoicesForCustomer = async (req, res, next) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Unauthorized");

    const { customerId } = req.params;
    if (!isValidId(customerId)) return sendError(res, 400, "Invalid ID");

    const { page = 1, limit = 20, status, sort = "desc" } = req.query;

    const pageNum = parsePositiveInt(page, 1);
    const limitNum = parsePositiveInt(limit, 20, 100);
    const sortOrder = sort === "asc" ? 1 : -1;

    const filter = {
      provider: provider._id,
      customer: customerId,
    };
    if (status && typeof status === "string") {
      filter.status = status;
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ createdAt: sortOrder })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      invoices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error("❌ getInvoicesForCustomer error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
   UPDATE INVOICE (Whitelisted fields)
------------------------------------------------------- */

const ALLOWED_UPDATE_FIELDS = [
  "items",
  "subtotal",
  "tax",
  "taxPct",
  "total",
  "paid",
  "balance",
  "invoiceNumber",
  "issueDate",
  "dueDate",
  "status",
  "notes",
];

export const updateInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid invoice ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Unauthorized");

    const invoice = await Invoice.findOne({
      _id: id,
      provider: provider._id,
    });

    if (!invoice) return sendError(res, 404, "Invoice not found");

    // Whitelist fields only
    const updateData = {};
    ALLOWED_UPDATE_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updateData[field] = req.body[field];
      }
    });

    // Normalize numeric fields
    ["subtotal", "tax", "taxPct", "total", "paid", "balance"].forEach((f) => {
      if (updateData[f] !== undefined) updateData[f] = safeNum(updateData[f]);
    });

    const subtotal = updateData.subtotal ?? invoice.subtotal;
    const tax = updateData.tax ?? invoice.tax;
    const total = updateData.total ?? subtotal + tax;
    const paid = updateData.paid ?? invoice.paid;

    if (updateData.balance === undefined) {
      updateData.balance = safeNum(total - paid);
    }

    Object.assign(invoice, updateData);
    await invoice.save();

    try {
      await CustomerTimeline.create({
        provider: provider._id,
        customer: invoice.customer,
        type: "invoice_update",
        title: `Invoice ${invoice.invoiceNumber || invoice._id} updated`,
        description: "Invoice updated.",
        amount: invoice.total,
        invoice: invoice._id,
        createdAt: new Date(),
      });
    } catch {
      // Non-fatal
    }

    return res.json({ success: true, invoice });
  } catch (err) {
    console.error("❌ updateInvoice error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
   DELETE INVOICE
------------------------------------------------------- */
export const deleteInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid invoice ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Unauthorized");

    const invoice = await Invoice.findOne({
      _id: id,
      provider: provider._id,
    });

    if (!invoice) return sendError(res, 404, "Invoice not found");

    const customerId = invoice.customer;

    await Invoice.deleteOne({ _id: invoice._id });


    try {
      await CustomerTimeline.create({
        provider: provider._id,
        customer: customerId,
        type: "invoice_deleted",
        title: `Invoice ${invoice.invoiceNumber || invoice._id} deleted`,
        description: "Invoice removed.",
        amount: invoice.total,
        invoice: invoice._id,
        createdAt: new Date(),
      });
    } catch {
      // Non-fatal
    }

    return res.json({ success: true, message: "Invoice deleted" });
  } catch (err) {
    console.error("❌ deleteInvoice error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
   PAY INVOICE NOW — Idempotent + Ledger + Helpio Pay Branding
------------------------------------------------------- */
export const payInvoiceNow = async (req, res) => {
  try {
    const { id } = req.params;
    const { idempotencyKey } = req.body;

    if (!isValidId(id)) return sendError(res, 400, "Invalid invoice ID");
    if (!idempotencyKey)
      return sendError(res, 400, "idempotencyKey is required");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Unauthorized");

    const invoice = await Invoice.findOne({
      _id: id,
      provider: provider._id,
    }).populate("customer");

    if (!invoice) return sendError(res, 404, "Invoice not found");

    const client = invoice.customer;
    if (!client?.stripeCustomerId && !isSimulatedStripe) {
      return sendError(res, 400, "Customer missing payment credentials");
    }

    const totalSafe = safeNum(invoice.total);
    const paidSafe = safeNum(invoice.paid);
    const balanceField = safeNum(invoice.balance);
    const outstanding =
      balanceField > 0 ? balanceField : Math.max(0, totalSafe - paidSafe);

    if (outstanding <= 0 || invoice.status === "PAID") {
      return res.json({ success: true, alreadyPaid: true, invoice });
    }

    const amount = outstanding;
    const currency = "usd";
    const grossCents = Math.floor(amount * 100);

    // Centralized B19 Fee Engine
    const fees = calculateFees(grossCents);
    const stripeFeeCents = fees.processorFeeCents;
    const helpioFeeCents = fees.platformFeeCents;
    const totalFeeCents = fees.totalFeeCents;
    const netAmountCents = fees.netAmountCents;

    const feeMetadata = {
      stripeFeeCents,
      helpioFeeCents,
      totalFeeCents,
      netAmountCents,
      grossAmountCents: grossCents,
      feeModel: "v1_helpio_1pct_stripe_2_9pct_30c",
    };

    /* -------------------------------------------------------
       Reserve idempotency key
    ------------------------------------------------------- */
    let idem;
    try {
      idem = await reserveIdempotencyKey({
        key: idempotencyKey,
        type: "invoice_payment",
        amount: grossCents,
        currency,
        invoiceId: invoice._id,
        providerId: provider._id,
        customerId: client._id,
        initiatedBy: "api",
        payloadForHash: {
          invoiceId: invoice._id.toString(),
          amount,
          currency,
          providerId: provider._id.toString(),
          customerId: client._id.toString(),
        },
        extraContext: { route: "payInvoiceNow" },
      });
    } catch (err) {
      return sendError(res, 400, err.message);
    }

    if (idem.status === "existing_completed") {
      return res.json({
        success: true,
        mode: "replayed",
        message: "Invoice already paid.",
        paymentIntentId: idem.record.stripePaymentIntentId,
      });
    }

    if (idem.status === "existing_in_progress") {
      return sendError(res, 409, "Payment already in progress.");
    }

    if (idem.status === "existing_failed") {
      return sendError(res, 409, "Previous payment failed. Use new key.");
    }

    const idemId = idem.record._id;

    /* Apply payment */
    const applyPaymentToInvoice = async (modeLabel) => {
      const newPaid = safeNum(invoice.paid) + amount;
      const newBalance = Math.max(0, safeNum(invoice.total) - newPaid);

      invoice.paid = newPaid;
      invoice.balance = newBalance;
      if (newBalance <= 0) invoice.status = "PAID";

      await invoice.save();

      await CustomerTimeline.create({
        provider: provider._id,
        customer: client._id,
        type: "invoice_paid",
        title: `Invoice ${invoice.invoiceNumber || invoice._id} paid`,
        description:
          modeLabel === "simulated"
            ? "Invoice paid (simulation)"
            : "Invoice paid via Helpio Pay",
        amount,
        invoice: invoice._id,
        createdAt: new Date(),
      });

      return invoice;
    };

    /* -------------------------------------------------------
       SIMULATED MODE
    ------------------------------------------------------- */
    if (isSimulatedStripe || !stripeClient || !isLiveStripe) {
      try {
        const updatedInvoice = await applyPaymentToInvoice("simulated");

        let ledgerResult = null;
        try {
          ledgerResult = await recordInvoicePaymentLedger({
            providerId: provider._id,
            customerId: client._id,
            invoiceId: invoice._id,
            invoiceNumber: invoice.invoiceNumber || null,
            stripePaymentIntentId: null,
            stripeChargeId: null,
            grossAmountCents: grossCents,
            feeAmountCents: totalFeeCents,
            netAmountCents,
            settlementDays: 7,
            trigger: "simulated_api",
            metadata: {
              route: "payInvoiceNow",
              mode: "simulated",
              idempotencyKey,
              ...feeMetadata,
            },
          });
        } catch (ledgerErr) {
          console.error(
            "❌ Ledger error (simulated invoice payment):",
            ledgerErr
          );
        }

        await markIdempotencyKeyCompleted(idemId, {
          stripePaymentIntentId: null,
          extraContext: { simulated: true },
        });

        return res.json({
          success: true,
          mode: "simulated",
          invoice: updatedInvoice,
          ledgerEntry: ledgerResult?.entry || null,
          providerBalance: ledgerResult?.balance || null,
        });
      } catch (err) {
        await markIdempotencyKeyFailed(idemId, {
          extraContext: { error: err.message },
        });
        throw err;
      }
    }

    /* -------------------------------------------------------
       LIVE MODE — Helpio Pay (Stripe Backend)
    ------------------------------------------------------- */
    let paymentIntent;
    try {
      paymentIntent = await stripeClient.paymentIntents.create(
        {
          amount: grossCents,
          currency,
          customer: client.stripeCustomerId,
          confirm: true,
          off_session: true,
          description: `Helpio Pay • Invoice Payment`,
          metadata: {
            invoiceId: String(invoice._id),
            providerId: String(provider._id),
            customerId: String(client._id),
            type: "helpio_invoice_payment",
            brand: "Helpio Pay",
            purpose: "Invoice Payment",
          },
        },
        { idempotencyKey }
      );
    } catch (err) {
      await markIdempotencyKeyFailed(idemId, {
        extraContext: { processorError: err.message },
      });
      throw err;
    }

    /* -------------------------------------------------------
       SUCCESS
    ------------------------------------------------------- */
    if (
      paymentIntent.status === "succeeded" ||
      paymentIntent.status === "requires_capture"
    ) {
      const updatedInvoice = await applyPaymentToInvoice("live");

      let ledgerResult = null;
      try {
        ledgerResult = await recordInvoicePaymentLedger({
          providerId: provider._id,
          customerId: client._id,
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber || null,
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId: paymentIntent.latest_charge || null,
          grossAmountCents: grossCents,
          feeAmountCents: totalFeeCents,
          netAmountCents,
          settlementDays: 7,
          trigger: "online_api",
          metadata: {
            route: "payInvoiceNow",
            mode: "live",
            idempotencyKey,
            helpioPayStatus: paymentIntent.status,
            helpioPayChargeId: paymentIntent.latest_charge || null,
            processor: "helpio_pay_backend",
            chargeType: "invoice",
            ...feeMetadata,
          },
        });
      } catch (ledgerErr) {
        console.error("❌ Ledger error (live invoice payment):", ledgerErr);
      }

      await markIdempotencyKeyCompleted(idemId, {
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId: paymentIntent.latest_charge || null,
        extraContext: { status: paymentIntent.status },
      });

      return res.json({
        success: true,
        mode: "live",
        invoice: updatedInvoice,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        ledgerEntry: ledgerResult?.entry || null,
        providerBalance: ledgerResult?.balance || null,
      });
    }

    /* -------------------------------------------------------
       FAILURE
    ------------------------------------------------------- */
    await markIdempotencyKeyFailed(idemId, {
      extraContext: { status: paymentIntent.status },
    });

    return res.status(402).json({
      success: false,
      mode: "live",
      message: "Payment failed",
      status: paymentIntent.status,
    });
  } catch (err) {
    console.error("❌ payInvoiceNow error:", err);
    return sendError(res, 500, "Server error processing invoice payment");
  }
};

/* -------------------------------------------------------
   REFUND INVOICE — Idempotent + Partial + Dispute Ready
------------------------------------------------------- */
export const refundInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason, idempotencyKey } = req.body;

    if (!isValidId(id)) return sendError(res, 400, "Invalid invoice ID");
    if (!idempotencyKey)
      return sendError(res, 400, "idempotencyKey is required");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Unauthorized");

    const invoice = await Invoice.findOne({
      _id: id,
      provider: provider._id,
    }).populate("customer");

    if (!invoice) return sendError(res, 404, "Invoice not found");

    const client = invoice.customer;
    if (!client) return sendError(res, 400, "Invoice missing customer");

    const paidSafe = safeNum(invoice.paid);
    if (paidSafe <= 0) {
      return sendError(res, 400, "Nothing to refund on this invoice.");
    }

    let refundAmount = amount !== undefined ? safeNum(amount) : paidSafe;
    if (!refundAmount || refundAmount <= 0)
      return sendError(res, 400, "Valid positive refund amount required.");
    if (refundAmount > paidSafe) {
      return sendError(
        res,
        400,
        `Refund cannot exceed paid amount (${paidSafe}).`
      );
    }

    const currency = "usd";
    const refundCents = Math.floor(refundAmount * 100);

    /* -------------------------------------------------------
       IDEMPOTENCY RESERVE
    ------------------------------------------------------- */
    let idem;
    try {
      idem = await reserveIdempotencyKey({
        key: idempotencyKey,
        type: "invoice_refund",
        amount: refundCents,
        currency,
        invoiceId: invoice._id,
        providerId: provider._id,
        customerId: client._id,
        initiatedBy: "api",
        payloadForHash: {
          invoiceId: invoice._id.toString(),
          refundAmount,
          currency,
          providerId: provider._id.toString(),
          customerId: client._id.toString(),
        },
        extraContext: { route: "refundInvoice" },
      });
    } catch (err) {
      return sendError(res, 400, err.message);
    }

    if (idem.status === "existing_completed") {
      return res.json({
        success: true,
        mode: "replayed",
        message: "Refund already processed.",
      });
    }

    if (idem.status === "existing_in_progress")
      return sendError(res, 409, "Refund already in progress.");

    if (idem.status === "existing_failed")
      return sendError(res, 409, "Previous refund failed. Use new key.");

    const idemId = idem.record._id;

    /* -------------------------------------------------------
       Helper to create refund ledger entry
    ------------------------------------------------------- */
    const createRefundLedgerEntry = async ({
      providerId,
      customerId,
      invoiceId,
      stripePaymentIntentId,
      stripeChargeId,
      stripeRefundId,
      stripeBalanceTransactionId,
      refundAmountCents,
      simulated,
    }) => {
      return LedgerEntry.create({
        provider: providerId,
        customer: customerId,
        type: "refund",
        direction: "debit",
        amount: refundAmountCents,
        currency,
        sourceType: "invoice",
        invoice: invoiceId,
        stripePaymentIntentId: stripePaymentIntentId || null,
        stripeChargeId: stripeChargeId || null,
        stripeRefundId: stripeRefundId || null,
        stripeBalanceTransactionId: stripeBalanceTransactionId || null,
        effectiveAt: new Date(),
        availableAt: new Date(),
        status: "posted",
        notes: reason || "Invoice refund",
        metadata: {
          brand: "Helpio Pay",
          type: "helpio_invoice_refund",
          simulated: !!simulated,
          stripeRefundId,
        },
        createdBy: "admin",
      });
    };

    /* -------------------------------------------------------
       SIMULATED MODE
    ------------------------------------------------------- */
    if (isSimulatedStripe || !stripeClient || !isLiveStripe) {
      try {
        await CustomerTimeline.create({
          provider: provider._id,
          customer: client._id,
          type: "invoice_refund",
          title: `Refund issued (simulation) for invoice ${
            invoice.invoiceNumber || invoice._id
          }`,
          description: `Simulated refund of $${refundAmount.toFixed(2)}`,
          amount: -refundAmount,
          invoice: invoice._id,
          createdAt: new Date(),
        });

        const ledgerEntry = await createRefundLedgerEntry({
          providerId: provider._id,
          customerId: client._id,
          invoiceId: invoice._id,
          stripePaymentIntentId: null,
          stripeChargeId: null,
          stripeRefundId: null,
          stripeBalanceTransactionId: null,
          refundAmountCents: refundCents,
          simulated: true,
        });

        await markIdempotencyKeyCompleted(idemId, {
          stripePaymentIntentId: null,
          extraContext: { simulated: true },
        });

        return res.json({
          success: true,
          mode: "simulated",
          invoice,
          refundAmount,
          ledgerEntry,
        });
      } catch (err) {
        await markIdempotencyKeyFailed(idemId, {
          extraContext: { error: err.message },
        });
        console.error("❌ Simulated refund error:", err);
        return sendError(res, 500, "Simulated refund failed.");
      }
    }

    /* -------------------------------------------------------
       LIVE MODE — Charge lookup for refund
    ------------------------------------------------------- */
    const chargeEntry = await LedgerEntry.findOne({
      provider: provider._id,
      invoice: invoice._id,
      direction: "credit",
      status: "posted",
      type: { $in: ["charge", "terminal_charge"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!chargeEntry || !chargeEntry.stripePaymentIntentId) {
      await markIdempotencyKeyFailed(idemId, {
        extraContext: { error: "No charge ledger entry found for refund." },
      });
      return sendError(
        res,
        400,
        "Unable to locate original payment for refund (no ledger charge found)."
      );
    }

    let refund;
    try {
      refund = await stripeClient.refunds.create(
        {
          payment_intent: chargeEntry.stripePaymentIntentId,
          amount: refundCents,
          reason: reason || undefined,
          metadata: {
            invoiceId: String(invoice._id),
            providerId: String(provider._id),
            customerId: String(client._id),
            brand: "Helpio Pay",
            type: "helpio_invoice_refund",
          },
        },
        { idempotencyKey }
      );
    } catch (err) {
      await markIdempotencyKeyFailed(idemId, {
        extraContext: { processorError: err.message },
      });
      console.error("❌ Stripe refund error:", err);
      return sendError(res, 500, "Processor error issuing refund.");
    }

    // Timeline entry
    try {
      await CustomerTimeline.create({
        provider: provider._id,
        customer: client._id,
        type: "invoice_refund",
        title: `Refund issued for invoice ${
          invoice.invoiceNumber || invoice._id
        }`,
        description: `Refund of $${refundAmount.toFixed(
          2
        )} via Helpio Pay`,
        amount: -refundAmount,
        invoice: invoice._id,
        createdAt: new Date(),
      });
    } catch {
      // Non-fatal
    }

    // Ledger entry
    let ledgerEntry = null;
    try {
      ledgerEntry = await createRefundLedgerEntry({
        providerId: provider._id,
        customerId: client._id,
        invoiceId: invoice._id,
        stripePaymentIntentId: chargeEntry.stripePaymentIntentId || null,
        stripeChargeId: chargeEntry.stripeChargeId || null,
        stripeRefundId: refund.id,
        stripeBalanceTransactionId: refund.balance_transaction || null,
        refundAmountCents: refundCents,
        simulated: false,
      });
    } catch (e) {
      console.error("⚠️ Ledger refund entry error:", e.message);
    }

    await markIdempotencyKeyCompleted(idemId, {
      stripePaymentIntentId: chargeEntry.stripePaymentIntentId,
      extraContext: {
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount,
      },
    });

    return res.json({
      success: true,
      mode: "live",
      invoice,
      refund,
      ledgerEntry,
    });
  } catch (err) {
    console.error("❌ refundInvoice error:", err);
    return sendError(res, 500, "Server error processing invoice refund");
  }
};
