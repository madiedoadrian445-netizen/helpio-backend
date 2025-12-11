// src/utils/auditLogger.js
import mongoose from "mongoose";

/* ======================================================
   AUDIT EVENT MODEL
====================================================== */

const AuditEventSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    type: { type: String, required: true },

    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

AuditEventSchema.index({ createdAt: -1 });
AuditEventSchema.index({ type: 1, createdAt: -1 });
AuditEventSchema.index({ actorId: 1, createdAt: -1 });

const AuditEvent =
  mongoose.models.AuditEvent ||
  mongoose.model("AuditEvent", AuditEventSchema);

/* ======================================================
   SANITIZE METADATA
====================================================== */

const sanitizeMetadata = (data) => {
  if (!data) return {};

  try {
    const str = JSON.stringify(data);
    if (str.length > 50000) {
      return { truncated: true };
    }
    return JSON.parse(str);
  } catch {
    return { malformed: true };
  }
};

/* ======================================================
   MAIN AUDIT LOGGER
====================================================== */

export const logAuditEvent = async ({
  actorId = null,
  type = "",
  metadata = {},
  ip = "",
  userAgent = "",
}) => {
  try {
    if (!type) return;

    const cleanMeta = sanitizeMetadata(metadata);

    // Non-blocking write
    AuditEvent.create({
      actorId,
      type,
      metadata: cleanMeta,
      ip,
      userAgent,
    }).catch((err) => {
      console.error("❌ Failed writing audit event:", err.message);
    });

    console.log("📘 AUDIT:", {
      actorId,
      type,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ logAuditEvent failed:", err.message);
  }
};

/* ======================================================
   BACKWARD COMPATIBILITY (Old Code Uses auditLog)
====================================================== */
export const auditLog = logAuditEvent;

/* ======================================================
   DEFAULT EXPORT
====================================================== */
export default logAuditEvent;
