// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const serviceRoutes = require('./routes/service.routes');
const reviewRoutes = require('./routes/review.routes');
const bookingRoutes = require('./routes/booking.routes');

const app = express();

// security & parsing
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.set('trust proxy', 1);

// rate limits
app.use('/auth', rateLimit({ windowMs: 60 * 1000, max: 30 }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 120 }));

// routes
app.use('/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/bookings', bookingRoutes);

// health
app.get('/health', (_req, res) => res.json({ ok: true }));

// error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

module.exports = app;
