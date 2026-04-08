const express = require('express');
const { db } = require('../config/firebase');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// GET ALL GL CODES
router.get('/', async (req, res) => {
  try {
    const snap = await db.collection('glCodes')
      .where('active', '==', true)
      .get();

    const list = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
