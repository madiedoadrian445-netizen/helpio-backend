// src/routes/review.routes.js
const router = require('express').Router();
const ctl = require('../controllers/review.controller');
const { auth } = require('../middleware/auth');

// POST   /api/reviews            (user)
router.post('/', auth(true), ctl.addReview);

// GET    /api/reviews/:serviceId (public)
router.get('/:serviceId', ctl.listForService);

// DELETE /api/reviews/:id        (owner)
router.delete('/:id', auth(true), ctl.removeReview);

module.exports = router;
