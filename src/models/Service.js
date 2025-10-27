// src/models/Service.js
const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, index: true },
    location: { type: String },
    companyName: { type: String, trim: true }, // 👈 add this
    photos: [{ type: String }],
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    avgRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    geo: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], index: '2dsphere', default: undefined }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Service', ServiceSchema);
