// controllers/crmDashboardController.js
import { Invoice } from "../models/Invoice.js";
import Client from "../models/Client.js";
import { Provider } from "../models/Provider.js";

const getProviderId = async (userId) => {
  const provider = await Provider.findOne({ user: userId }).lean();
  return provider?._id;
};

export const getDashboardStats = async (req, res, next) => {
  try {
    const providerId = await getProviderId(req.user._id);
    if (!providerId) {
      return res.status(404).json({
        success: false,
        message: "Provider not found",
      });
    }

    // 🔥 Query invoices _fast_
    const invoices = await Invoice.find({ provider: providerId }).lean();

    // ----- TOTALS -----
    const totalRevenue = invoices.reduce((s, i) => s + Number(i.paid || 0), 0);
    const outstanding = invoices.reduce((s, i) => s + Number(i.balance || 0), 0);

    // ----- UNPAID, OVERDUE -----
    const unpaidInvoices = invoices.filter(i => Number(i.balance || 0) > 0).length;
    const overdueInvoices = invoices.filter(i => {
      if (!i.dueDate) return false;
      return new Date(i.dueDate) < new Date() && Number(i.balance || 0) > 0;
    }).length;

    // ----- INVOICE COUNT & AVERAGE -----
    const totalInvoices = invoices.length;
    const avgInvoice = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;

    // ----- CLIENT COUNT -----
    const clients = await Client.find({ provider: providerId }).lean();
    const activeClients = clients.length;

    // ----- LAST INVOICE DATE -----
    let lastInvoiceDate = null;
    if (invoices.length > 0) {
      lastInvoiceDate = invoices
        .map(i => new Date(i.issueDate))
        .sort((a, b) => b - a)[0];
    }

    // ----- THIS MONTH STATS -----
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const invoicesThisMonth = invoices.filter(i =>
      new Date(i.issueDate) >= startOfMonth
    );

    const revenueThisMonth = invoicesThisMonth.reduce(
      (s, i) => s + Number(i.paid || 0),
      0
    );

    // ----- RECENT 5 INVOICES -----
    const recentInvoices = invoices
      .sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))
      .slice(0, 5);

    return res.status(200).json({
      success: true,
      stats: {
        totalRevenue,
        outstanding,
        unpaidInvoices,
        overdueInvoices,
        totalInvoices,
        avgInvoice,
        activeClients,
        lastInvoiceDate,
        revenueThisMonth,
        invoicesThisMonth: invoicesThisMonth.length,
      },
      recentInvoices,
    });

  } catch (err) {
    next(err);
  }
};
