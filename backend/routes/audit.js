/**
 * routes/audit.js  — MongoDB
 */
const express = require('express');
const { AuditLog } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient } = require('../utils/toClient');

const router = express.Router();
router.use(auth);

router.post('/', requireRole('Admin'), async (req, res) => {
  try {
    const { user, module: mod, action, recordId, oldValue, newValue, timestamp } = req.body;
    const entry = {
      user: user || req.user?.name || req.user?.email || 'Unknown',
      module: mod || 'Unknown',
      action: action || 'Unknown',
      recordId: recordId || null,
      oldValue: oldValue || null,
      newValue: newValue || null,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      createdBy: req.user?.uid || null,
    };
    const created = await AuditLog.create(entry);
    res.status(201).json({ id: String(created._id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', requireRole('Admin'), async (req, res) => {
  try {
    const { module: mod, action, user, from, to } = req.query;
    const filter = {};
    if (mod) filter.module = mod;
    if (action) filter.action = action;
    if (user) filter.user = user;
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to)   filter.timestamp.$lte = new Date(`${to}T23:59:59`);
    }

    const rows = await AuditLog.find(filter).sort({ timestamp: -1 }).limit(500).lean();
    const list = rows.map(toClient).map(e => ({
      ...e,
      timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
    }));

    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
