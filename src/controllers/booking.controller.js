// src/controllers/booking.controller.js
const Booking = require('../models/Booking');

exports.createBooking = async (req, res, next) => {
  try {
    const { service, date, notes, priceAtBooking } = req.body;
    const doc = await Booking.create({
      service,
      date,
      notes,
      priceAtBooking,
      user: req.user.id,
    });
    res.status(201).json(doc);
  } catch (e) { next(e); }
};

exports.listMine = async (req, res, next) => {
  try {
    const items = await Booking.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(items);
  } catch (e) { next(e); }
};
