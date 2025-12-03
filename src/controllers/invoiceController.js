import Invoice from "../models/Invoice.js";
import { CustomerTimeline } from "../models/CustomerTimeline.js";
import { Provider } from "../models/Provider.js";
import Client from "../models/Client.js"; // ⭐ Correct model

// Get provider profile that belongs to the logged-in user
const getProviderId = async (userId) => {
  const provider = await Provider.findOne({ user: userId });
  return provider?._id;
};

/* -------------------------------------------------------
   CREATE INVOICE  (YOUR ORIGINAL WORKING LOGIC)
------------------------------------------------------- */
export const createInvoice = async (req, res, next) => {
  try {
    const providerId = await getProviderId(req.user._id);

    if (!providerId) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found",
      });
    }

    const {
      customer,
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

    if (!customer) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    const computedBalance =
      typeof balance === "number"
        ? balance
        : (total || 0) - (paid || 0);

    // CREATE INVOICE
    const invoice = await Invoice.create({
      provider: providerId,
      customer,
      items: items || [],
      subtotal: subtotal || 0,
      tax: tax || 0,
      taxPct: taxPct || 0,
      total: total || 0,
      paid: paid || 0,
      balance: computedBalance,
      invoiceNumber,
      issueDate,
      dueDate,
      status: status || "DUE",
      notes: notes || "",
    });

    // Link to Client
    await Client.findByIdAndUpdate(customer, {
      $push: { invoices: invoice._id },
      $set: { lastInvoiceAt: new Date() }
    });

    // Customer Timeline
    await CustomerTimeline.create({
      provider: providerId,
      customer: customer,
      type: "invoice",
      title: `Invoice ${invoiceNumber || invoice._id} created`,
      description: `Invoice created for $${Number(invoice.total).toLocaleString("en-US")}`,
      amount: invoice.total,
      invoice: invoice._id,
      createdAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      invoice,
    });

  } catch (err) {
    next(err);
  }
};

/* -------------------------------------------------------
   GET INVOICE BY ID
------------------------------------------------------- */
export const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("customer")
      .populate("provider");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    return res.json({ success: true, invoice });
  } catch (err) {
    next(err);
  }
};

/* -------------------------------------------------------
   GET ALL INVOICES FOR LOGGED-IN PROVIDER
------------------------------------------------------- */
export const getInvoicesForProvider = async (req, res, next) => {
  try {
    const providerId = await getProviderId(req.user._id);

    const invoices = await Invoice.find({ provider: providerId })
      .sort({ createdAt: -1 });

    return res.json({ success: true, invoices });
  } catch (err) {
    next(err);
  }
};

/* -------------------------------------------------------
   GET ALL INVOICES FOR A CUSTOMER
------------------------------------------------------- */
export const getInvoicesForCustomer = async (req, res, next) => {
  try {
    const invoices = await Invoice.find({
      customer: req.params.customerId,
    }).sort({ createdAt: -1 });

    return res.json({ success: true, invoices });
  } catch (err) {
    next(err);
  }
};

/* -------------------------------------------------------
   UPDATE INVOICE
------------------------------------------------------- */
export const updateInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    return res.json({ success: true, invoice });
  } catch (err) {
    next(err);
  }
};

/* -------------------------------------------------------
   DELETE INVOICE
------------------------------------------------------- */
export const deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    return res.json({
      success: true,
      message: "Invoice deleted",
    });
  } catch (err) {
    next(err);
  }
};
