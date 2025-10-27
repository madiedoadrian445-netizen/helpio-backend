// src/routes/auth.routes.js
const router = require('express').Router();
const { register, login, me } = require('../controllers/auth.controller');
const { auth } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', auth(true), me);

module.exports = router;
