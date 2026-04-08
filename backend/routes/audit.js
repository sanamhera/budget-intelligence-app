/**
 * routes/audit.js  — FY 2026-27  [NEW FILE]
 * Provides:
 *   POST /audit       — create an audit entry (called by frontend auditLog helper)
 *   GET  /audit       — list entries; Admin only; supports ?module=&action=&user=&from=&to=
 */
const express = require('express');
const { db }  = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

/* ── POST — create entry ─────────────────────────────────────── */
// Open to all authenticated users (frontend fires this on every mutation)
router.post('/', async (req, res) => {
  try {
    const { user, module: mod, action, recordId, oldValue, newValue, timestamp } = req.body;
    const entry = {
      user:      user      || req.user?.name || req.user?.email || 'Unknown',
      module:    mod       || 'Unknown',
      action:    action    || 'Unknown',
      recordId:  recordId  || null,
      oldValue:  oldValue  || null,
      newValue:  newValue  || null,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      createdBy: req.user?.uid || null,
    };
    const ref = await db.collection('audit').add(entry);
    res.status(201).json({ id: ref.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET — list with filters ─────────────────────────────────── */
// Admin only
router.get('/', requireRole('Admin'), async (req, res) => {
  try {
    const { module: mod, action, user, from, to } = req.query;

    // Firestore doesn't support multi-field inequality without composite index,
    // so we filter date range in JS after fetching. For large datasets, add an index.
    let q = db.collection('audit').orderBy('timestamp', 'desc').limit(500);

    // Single equality filters Firestore can handle efficiently
    if (mod)    q = q.where('module', '==', mod);
    if (action) q = q.where('action', '==', action);
    if (user)   q = q.where('user',   '==', user);

    const snap = await q.get();
    let list   = snap.docs.map(d => ({ id: d.id, ...d.data(),
      // Convert Firestore Timestamp to ISO string for frontend
      timestamp: d.data().timestamp?.toDate?.()?.toISOString() || d.data().timestamp,
    }));

    // Date range filter in JS
    if (from) {
      const fromDate = new Date(from);
      list = list.filter(e => e.timestamp && new Date(e.timestamp) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to + 'T23:59:59');
      list = list.filter(e => e.timestamp && new Date(e.timestamp) <= toDate);
    }

    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;