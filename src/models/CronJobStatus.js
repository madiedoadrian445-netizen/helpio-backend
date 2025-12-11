// src/models/CronJobStatus.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const CronJobStatusSchema = new Schema(
  {
    jobKey: {
      type: String,
      required: true,
      unique: true,
    },
    jobName: {
      type: String,
      required: true,
    },
    schedule: {
      type: String, // cron expression or "internal"
    },

    lastRunAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastErrorAt: { type: Date },

    lastDurationMs: { type: Number },
    lastErrorMessage: { type: String },

    lastStatus: {
      type: String,
      enum: ["never", "success", "error"],
      default: "never",
    },

    runsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

CronJobStatusSchema.index({ jobKey: 1 }, { unique: true });

export default mongoose.model("CronJobStatus", CronJobStatusSchema);
