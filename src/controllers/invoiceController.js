import { Invoice } from "../models/Invoice.js";
import { CustomerTimeline } from "../models/CustomerTimeline.js";
import { Provider } from "../models/Provider.js";

const getProviderId = async (userId) => {
  const provider = await Provider.findOne({ user: userId });
  return provider?._id;
};

export const createInvoice = async (req, res, next) => {
  try {
    const providerId = await getProviderId(req.user._id);

    if (!providerId) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found",
      });
    }

    const invoice = await Invoice.create({
      provider: providerId,
      customer: req.body.customer,
      items: req.body.items || [],
      subtotal: req.body.subtotal || 0,
      tax: req.body.tax || 0,
      total: req.body.total || 0,
      notes: req.body.notes || "",
    });

    // 🔥 Add timeline record automatically
    await CustomerTimeline.create({
      customer: req.body.customer,
      type: "invoice",
      title: "Invoice created",
      description: `Invoice created for $${Number(invoice.total).toLocaleString("en-US")}`,
      amount: invoice.total,
    });

    return res.status(201).json({
      success: true,
      invoice,
    });
  } catch (err) {
    next(err);
  }
};
