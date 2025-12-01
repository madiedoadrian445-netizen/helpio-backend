// src/controllers/customerController.js
import { Customer } from "../models/Customer.js";
import { Provider } from "../models/Provider.js";
import { CustomerTimeline } from "../models/CustomerTimeline.js";

/* -----------------------------------------------------
   Helper: get providerId from logged-in user
------------------------------------------------------ */
const getProviderId = async (userId) => {
  const provider = await Provider.findOne({ user: userId });
  return provider?._id;
};

/* -----------------------------------------------------
   CREATE CUSTOMER
------------------------------------------------------ */
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

    // TIMELINE LOG: NEW CLIENT
    await CustomerTimeline.create({
      provider: providerId,
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

/* -----------------------------------------------------
   GET ALL CUSTOMERS FOR THIS PROVIDER
------------------------------------------------------ */
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

/* -----------------------------------------------------
   GET CUSTOMER BY ID
------------------------------------------------------ */
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

/* -----------------------------------------------------
   UPDATE CUSTOMER
------------------------------------------------------ */
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

    // TIMELINE LOG: CLIENT UPDATED
    await CustomerTimeline.create({
      provider: customer.provider,
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

/* -----------------------------------------------------
   DELETE CUSTOMER
------------------------------------------------------ */
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
    const providerId = customer.provider;

    await customer.deleteOne();

    // TIMELINE LOG: CLIENT DELETED
    await CustomerTimeline.create({
      provider: providerId,
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
