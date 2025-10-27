// src/routes/service.routes.js
const router = require('express').Router();
const { list, create } = require('../controllers/service.controller');
const { protect } = require('../middleware/auth');
const Service = require('../models/Service');

(async () => {
  try {
    await Service.collection.createIndex({ title: 'text', description: 'text' });
    await Service.collection.createIndex({ geo: '2dsphere' });
  } catch {}
})();

router.get('/', list);
router.post('/', protect, create);

module.exports = router;
