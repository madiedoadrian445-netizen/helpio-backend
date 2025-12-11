// src/utils/AppError.js

/**
 * Central application error class for normalized API errors.
 *
 * Usage:
 *   throw new AppError({
 *     statusCode: 404,
 *     code: "CUSTOMER_NOT_FOUND",
 *     message: "Customer not found",
 *     details: { customerId }
 *   });
 */
export class AppError extends Error {
  constructor({
    statusCode = 500,
    code = "INTERNAL_SERVER_ERROR",
    message = "Something went wrong",
    details = null,
    isOperational = true
  } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Quick helpers (optional, but nice to have)
 */
export const badRequest = (message, details) =>
  new AppError({ statusCode: 400, code: "BAD_REQUEST", message, details });

export const unauthorized = (message = "Not authorized") =>
  new AppError({ statusCode: 401, code: "UNAUTHORIZED", message });

export const forbidden = (message = "Forbidden") =>
  new AppError({ statusCode: 403, code: "FORBIDDEN", message });

export const notFoundError = (message = "Resource not found", details) =>
  new AppError({ statusCode: 404, code: "NOT_FOUND", message, details });

export const conflict = (message = "Conflict", details) =>
  new AppError({ statusCode: 409, code: "CONFLICT", message, details });

export const internalError = (message = "Internal server error", details) =>
  new AppError({
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message,
    details
  });
