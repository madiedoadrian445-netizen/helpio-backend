// src/controllers/providerController.js
import { Provider } from "../models/Provider.js";

export const createProvider = async (req, res, next) => {
  try {
    const existing = await Provider.findOne({ user: req.user._id });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Provider profile already exists for this user",
      });
    }

    const provider = await Provider.create({
      user: req.user._id,
      ...req.body,
    });

    return res.status(201).json({
      success: true,
      provider,
    });
  } catch (err) {
    next(err);
  }
};

export const updateProvider = async (req, res, next) => {
  try {
    const provider = await Provider.findOne({ user: req.user._id });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found",
      });
    }

    Object.assign(provider, req.body);

    await provider.save();

    return res.json({
      success: true,
      provider,
    });
  } catch (err) {
    next(err);
  }
};

export const getMyProviderProfile = async (req, res, next) => {
  try {
    const provider = await Provider.findOne({ user: req.user._id });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found",
      });
    }

    return res.json({
      success: true,
      provider,
    });
  } catch (err) {
    next(err);
  }
};

export const getAllProviders = async (req, res, next) => {
  try {
    const providers = await Provider.find().populate("user", "name email");

    return res.json({
      success: true,
      providers,
    });
  } catch (err) {
    next(err);
  }
};

export const getProviderById = async (req, res, next) => {
  try {
    const provider = await Provider.findById(req.params.id).populate(
      "user",
      "name email"
    );

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider not found",
      });
    }

    return res.json({
      success: true,
      provider,
    });
  } catch (err) {
    next(err);
  }
};
