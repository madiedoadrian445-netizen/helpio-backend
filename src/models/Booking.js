// src/models/Booking.js
const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
  {
    service:   { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date:      { type: Date, required: true },
    status:    { type: String, enum: ['pending','confirmed','completed','cancelled'], default: 'pending' },
    notes:     { type: String, default: '' },
    priceAtBooking: { type: Number, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', BookingSchema);
