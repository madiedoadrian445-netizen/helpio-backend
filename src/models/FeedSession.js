// src/models/FeedSession.js
import mongoose from "mongoose";

const FeedSessionSchema = new mongoose.Schema(
  {
    user_id:    { type: String, required: true },
    session_id: { type: String, required: true, unique: true },
    seed:       { type: Number, required: true },
    expires_at: { type: Date,   required: true },
  },
  { timestamps: true }
);

// Primary lookup index
FeedSessionSchema.index({ user_id: 1, expires_at: 1 });

// FIX #10 — Auto-delete expired sessions
// Without this, every session ever created stays in the collection
// forever and slows down every findOne query over time.
// MongoDB checks this index every 60 seconds and deletes expired docs.
FeedSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("FeedSession", FeedSessionSchema);