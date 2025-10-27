// src/server.js
require('dotenv').config();
const app = require('./app');
const connect = require('./config/db');

const PORT = process.env.PORT || 4000;

(async () => {
  await connect();
  app.listen(PORT, () => {
    console.log(`Helpio API running on :${PORT}`);
  });
})();
