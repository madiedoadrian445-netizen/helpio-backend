import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String },
    phoneFormatted: { type: String },
    email: { type: String },
    company: { type: String },
    address: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("Client", ClientSchema);
