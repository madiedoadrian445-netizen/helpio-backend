// src/models/Review.js
import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
  {
    // Listing reviewed
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },

    // Provider being reviewed
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
    },

    // User leaving review
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🔒 Verified interaction anchor
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      unique: true, // one review per conversation
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },

   comment: {
  type: String,
  default: "",
  trim: true,
},

    imageUrl: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["published", "removed"],
      default: "published",
    },
  },
  { timestamps: true }
);

ReviewSchema.index({ service: 1, createdAt: -1 });

const Review = mongoose.model("Review", ReviewSchema);

export default Review;