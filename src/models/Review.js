// src/models/Review.js
const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema(
  {
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating:  { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', ReviewSchema);
