import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },

    amount: Number,
    transactionId: String,
    method: String,
    last4: String,
    status: String,
    date: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);