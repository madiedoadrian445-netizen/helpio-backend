// src/server.js
import app from "./app.js";

// ✅ Render automatically injects a PORT value
// Use that if available, otherwise default to 4000 for local dev
const PORT = process.env.PORT || 4000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Helpio API running on port ${PORT}`);
});
