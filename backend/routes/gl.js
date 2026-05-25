const express = require('express');
const { GlCode } = require('../models');
const { auth } = require('../middleware/auth');
const { toClient } = require('../utils/toClient');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const rows = await GlCode.find({ active: true }).lean();
    res.json(rows.map(toClient));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
