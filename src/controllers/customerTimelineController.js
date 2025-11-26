// src/controllers/customerTimelineController.js
import { Customer } from "../models/Customer.js";
import { Provider } from "../models/Provider.js";
import { CustomerTimeline } from "../models/CustomerTimeline.js";

const getProviderId = async (userId) => {
  const provider = await Provider.findOne({ user: userId });
  return provider?._id;
};

// Add timeline entry
export const addTimelineEntry = async (req, res, next) => {
  try {
    const providerId = await getProviderId(req.user._id);
    if (!providerId) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found",
      });
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (String(customer.provider) !== String(providerId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    const { type, title, description, amount } = req.body;

    const entry = await CustomerTimeline.create({
      provider: providerId,
      customer: customer._id,
      type: type || "other",
      title,
      description,
      amount,
    });

    return res.status(201).json({
      success: true,
      entry,
    });
  } catch (err) {
    next(err);
  }
};

// Get customer's timeline
export const getCustomerTimeline = async (req, res, next) => {
  try {
    const providerId = await getProviderId(req.user._id);
    if (!providerId) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found",
      });
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (String(customer.provider) !== String(providerId)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    const entries = await CustomerTimeline.find({
      provider: providerId,
      customer: customer._id,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({
      success: true,
      timeline: entries,
    });
  } catch (err) {
    next(err);
  }
};
