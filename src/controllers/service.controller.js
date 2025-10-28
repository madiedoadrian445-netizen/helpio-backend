// src/controllers/service.controller.js
import Service from "../models/Service.js";

// Create a new service
export const createService = async (req, res) => {
  try {
    const { title, description, price, category, location, photos } = req.body;

    if (!title || !description || !price)
      return res.status(400).json({ error: "Title, description, and price required" });

    const service = await Service.create({
      title,
      description,
      price,
      category,
      location,
      photos,
      userId: req.user?.id || null,
    });

    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all services
export const getAllServices = async (req, res) => {
  try {
    const services = await Service.find().sort({ createdAt: -1 });
    res.status(200).json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
