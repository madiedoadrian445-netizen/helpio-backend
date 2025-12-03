// src/routes/booking.routes.js
const router = require('express').Router();
const ctl = require('../controllers/booking.controller');
const { auth } = require('../middleware/auth');

// POST /api/bookings      (user)
router.post('/', auth(true), ctl.createBooking);

// GET  /api/bookings/me   (user)
router.get('/me', auth(true), ctl.listMine);

module.exports = router;
