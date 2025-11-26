// src/controllers/customerController.js
import { Customer } from "../models/Customer.js";
import { Provider } from "../models/Provider.js";
import { CustomerTimeline } from "../models/CustomerTimeline.js";



const getProviderId = async (userId) => {
  const provider = await Provider.findOne({ user: userId });
  return provider?._id;
};

export const createCustomer = async (req, res, next) => {
  try {
    const providerId = await getProviderId(req.user._id);

    if (!providerId) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found",
      });
    }

    const customer = await Customer.create({
      provider: providerId,
      ...req.body,
    });

    // TIMELINE: auto-log new client
    await Timeline.create({
      customer: customer._id,
      type: "note",
      title: "New client added",
      description: `Client ${customer.name || ""} was added to your CRM.`,
    });

    return res.status(201).json({
      success: true,
      customer,
    });
  } catch (err) {
    next(err);
  }
};

export const getMyCustomers = async (req, res, next) => {
  try {
    const providerId = await getProviderId(req.user._id);
    const customers = await Customer.find({ provider: providerId }).sort({
      createdAt: -1,
    });

    return res.json({
      success: true,
      customers,
    });
  } catch (err) {
    next(err);
  }
};

export const getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.json({
      success: true,
      customer,
    });
  } catch (err) {
    next(err);
  }
};

export const updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    Object.assign(customer, req.body);
    await customer.save();

    // TIMELINE: auto-log update
    await Timeline.create({
      customer: customer._id,
      type: "note",
      title: "Client updated",
      description: `Information for ${customer.name || ""} was updated.`,
    });

    return res.json({
      success: true,
      customer,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const deletedName = customer.name || "Client";

    // Delete customer
    await customer.deleteOne();

    // 🔥 TIMELINE: auto-log deletion
    await Timeline.create({
      customer: customer._id,
      type: "note",
      title: "Client deleted",
      description: `${deletedName} was removed from your CRM.`,
    });

    return res.json({
      success: true,
      message: "Customer removed",
    });
  } catch (err) {
    next(err);
  }
};
