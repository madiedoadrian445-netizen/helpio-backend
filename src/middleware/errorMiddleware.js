// src/middleware/errorMiddleware.js

import { AppError } from "../utils/AppError.js";
import { logError } from "../utils/logger.js";

/* -------------------------------------------------------
   404 NOT FOUND HANDLER
-------------------------------------------------------- */
export const notFound = (req, res, next) => {
  next(
    new AppError({
      statusCode: 404,
      code: "ROUTE_NOT_FOUND",
      message: `Route not found: ${req.originalUrl}`,
      details: { method: req.method, path: req.originalUrl }
    })
  );
};

/* -------------------------------------------------------
   MONGOOSE NORMALIZATION
-------------------------------------------------------- */
const normalizeMongooseError = (err) => {
  // Invalid ObjectId
  if (err.name === "CastError") {
    return new AppError({
      statusCode: 400,
      code: "INVALID_ID",
      message: `Invalid ${err.path || "identifier"}`,
      details: { value: err.value }
    });
  }

  // Validation errors
  if (err.name === "ValidationError") {
    const details = Object.keys(err.errors || {}).map((field) => ({
      field,
      message: err.errors[field].message,
    }));

    return new AppError({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid fields",
      details,
    });
  }

  // Duplicate key
  if (err.code === 11000) {
    return new AppError({
      statusCode: 409,
      code: "DUPLICATE_KEY",
      message: "Duplicate field value",
      details: err.keyValue
    });
  }

  return null;
};

/* -------------------------------------------------------
   STRIPE ERROR NORMALIZATION (Helpio Pay)
-------------------------------------------------------- */
const normalizeStripeError = (err) => {
  const base = {
    type: err.type,
    code: err.code,
    param: err.param,
    decline_code: err.decline_code,
    doc_url: err.doc_url,
    payment_intent: err.payment_intent?.id,
    charge: err.charge,
  };

  // Card decline
  if (err.type === "StripeCardError" || err.rawType === "card_error") {
    return new AppError({
      statusCode: 402,
      code: "CARD_DECLINED",
      message: err.message || "Your card was declined",
      details: base
    });
  }

  // Rate limit
  if (err.type === "RateLimitError") {
    return new AppError({
      statusCode: 429,
      code: "STRIPE_RATE_LIMIT",
      message: "Too many payment attempts",
      details: base
    });
  }

  // Authentication errors
  if (
    err.type === "StripePermissionError" ||
    err.type === "StripeAuthenticationError"
  ) {
    return new AppError({
      statusCode: 502,
      code: "STRIPE_AUTH_ERROR",
      message: "Payment processor authentication failed",
      details: base
    });
  }

  // Fallback Stripe error
  return new AppError({
    statusCode: 502,
    code: "STRIPE_ERROR",
    message: "Unexpected payment processor error",
    details: base
  });
};

/* -------------------------------------------------------
   GENERIC NORMALIZATION
-------------------------------------------------------- */
const normalizeGenericError = (err) => {
  // Already normalized?
  if (err instanceof AppError) return err;

  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return new AppError({
      statusCode: 401,
      code: "INVALID_TOKEN",
      message: "Authentication token invalid or expired",
    });
  }

  // Multer (file upload)
  if (err.name === "MulterError") {
    return new AppError({
      statusCode: 400,
      code: "UPLOAD_ERROR",
      message:
        err.code === "LIMIT_FILE_SIZE"
          ? "File too large (max 5MB)"
          : err.message || "File upload failed",
    });
  }

  // Cloudinary / Axios
  if (err.isAxiosError || String(err.message).includes("Cloudinary")) {
    return new AppError({
      statusCode: 500,
      code: "IMAGE_UPLOAD_ERROR",
      message: "Image upload failed",
    });
  }

  // Fallback
  return new AppError({
    statusCode: err.statusCode || 500,
    code: err.code || "INTERNAL_ERROR",
    message: err.message || "Internal server error",
    details: err.details || null
  });
};

/* -------------------------------------------------------
   MASTER ERROR HANDLER
-------------------------------------------------------- */
export const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || "unknown";

  let normalized =
    normalizeMongooseError(err) ||
    ((err.type?.startsWith("Stripe") || err.rawType) &&
      normalizeStripeError(err)) ||
    normalizeGenericError(err);

  // Logging (stack only printed in development)
  logError("api.error", {
    requestId,
    status: normalized.statusCode,
    code: normalized.code,
    message: normalized.message,
    method: req.method,
    path: req.originalUrl,
    details: normalized.details,
    ...(process.env.NODE_ENV !== "production" && { stack: normalized.stack }),
  });

  // Final API-safe response
  return res.status(normalized.statusCode).json({
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details || null,
      requestId,
    },
  });
};
