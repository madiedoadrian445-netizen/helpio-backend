// Unified API response helpers

export const sendSuccess = (res, data = {}, message = "OK", status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (
  res,
  message = "Server error",
  status = 500,
  type = "ERROR",
  details = null
) => {
  return res.status(status).json({
    success: false,
    message,
    error: {
      type,
      details,
    },
  });
};
