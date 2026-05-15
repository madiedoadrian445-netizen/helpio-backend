// src/middleware/errorHandler.js

export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  console.error("API Error:", err);

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
const isProd = process.env.NODE_ENV === "production";


// Mongoose validation error — return clean 400
if (err.name === "ValidationError") {
  return res.status(400).json({
    success: false,
    message: Object.values(err.errors).map((e) => e.message).join(", "),
  });
}

// Mongoose duplicate key error — return clean 409
if (err.code === 11000) {
  const field = Object.keys(err.keyValue || {})[0] || "field";
  return res.status(409).json({
    success: false,
    message: `${field} already exists`,
  });
}

// Mongoose bad ObjectId — return clean 400
if (err.name === "CastError") {
  return res.status(400).json({
    success: false,
    message: "Invalid ID format",
  });
}



res.status(statusCode).json({
  success: false,
  message: isProd && statusCode === 500
    ? "An unexpected error occurred"
    : err.message || "Server Error",
  stack: isProd ? undefined : err.stack,
});
};
