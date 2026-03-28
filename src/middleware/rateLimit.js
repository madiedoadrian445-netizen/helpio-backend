import rateLimit from "express-rate-limit";

/* -------------------------------------------------------
   GENERIC HANDLER (NO INFO LEAKS)
-------------------------------------------------------- */
const authLimiterHandler = (req, res) => {
  return res.status(429).json({
    success: false,
    message: "Too many requests. Please try again later.",
  });
};

/* -------------------------------------------------------
   LOGIN LIMITER
-------------------------------------------------------- */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: authLimiterHandler,
});

/* -------------------------------------------------------
   REGISTER LIMITER
-------------------------------------------------------- */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  handler: authLimiterHandler,
});

/* -------------------------------------------------------
   PROVIDER REGISTER LIMITER
-------------------------------------------------------- */
export const registerProviderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  handler: authLimiterHandler,
});

/* -------------------------------------------------------
   PHONE CODE SEND LIMITER
-------------------------------------------------------- */
export const sendPhoneCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  handler: authLimiterHandler,
});

/* -------------------------------------------------------
   PHONE CODE VERIFY LIMITER
-------------------------------------------------------- */
export const verifyPhoneCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  handler: authLimiterHandler,
});

/* -------------------------------------------------------
   PASSWORD RESET LIMITERS
-------------------------------------------------------- */
export const passwordResetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  handler: authLimiterHandler,
});

export const passwordResetActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  handler: authLimiterHandler,
});

/* -------------------------------------------------------
   REFRESH LIMITER
-------------------------------------------------------- */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  handler: authLimiterHandler,
});