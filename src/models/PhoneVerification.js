const mongoose = require("mongoose");

const phoneVerificationSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
  },

  code: {
    type: String,
    required: true,
  },

  expiresAt: {
    type: Date,
    required: true,
  },

  verified: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model(
  "PhoneVerification",
  phoneVerificationSchema
);