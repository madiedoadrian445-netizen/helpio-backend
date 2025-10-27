// src/server.js
require("dotenv").config();
const app = require("./app");
const connect = require("./config/db");

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";

(async () => {
  await connect();
  app.listen(PORT, HOST, () => {
    console.log(`Helpio API running on http://${HOST}:${PORT}`);
  });
})();
