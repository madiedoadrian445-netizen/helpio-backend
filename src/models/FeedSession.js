// models/FeedSession.js
import mongoose from "mongoose";

const FeedSessionSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, index: true, required: true },
    session_id: { type: String, index: true, required: true },
    seed: { type: Number, required: true },
    expires_at: { type: Date, index: true, required: true },
  },
  { timestamps: true }
);

FeedSessionSchema.index({ user_id: 1, expires_at: 1 });

export default mongoose.model("FeedSession", FeedSessionSchema);
