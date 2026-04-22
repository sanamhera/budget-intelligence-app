/**
 * routes/budgets.js  — FY Container
 *
 * A "budget" is just a financial-year label.
 * The first request to GET / auto-creates FY 26-27 if no budgets exist.
 *
 * Routes:
 *   GET    /api/budgets          — list all FY containers (auto-seeds FY 26-27)
 *   GET    /api/budgets/:id      — single budget
 *   POST   /api/budgets          — create new FY container (Admin/Finance)
 *   PATCH  /api/budgets/:id      — rename (Admin only)
 *   DELETE /api/budgets/:id      — delete (Admin only, only if no expenses)
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { db }  = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const DEFAULT_FY = 'FY 26-27';

/* ── audit helper ───────────────────────────────────────────── */
async function audit({ user, action, recordId, newValue, oldValue }) {
  try {
    await db.collection('audit').add({
      user:      user?.name || user?.email || 'Unknown',
      module:    'Budget',
      action,
      recordId:  recordId || null,
      oldValue:  oldValue != null ? JSON.stringify(oldValue) : null,
      newValue:  newValue != null ? JSON.stringify(newValue) : null,
      timestamp: new Date(),
    });
  } catch {}
}

/* ── auto-seed default FY ───────────────────────────────────── */
// Use a sentinel doc to prevent race-condition duplicate seeding
async function seedDefaultIfEmpty() {
  const snap = await db.collection('budgets').where('fy', '==', DEFAULT_FY).limit(1).get();
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  // Double-check with a named sentinel to prevent concurrent duplicate inserts
  const sentinelRef = db.collection('budgets').doc('_seed_fy2627');
  const sentinel = await sentinelRef.get();
  if (sentinel.exists) return { id: sentinel.id, ...sentinel.data() };
  const data = {
    fy:        DEFAULT_FY,
    name:      DEFAULT_FY,
    createdAt: new Date(),
    isDefault: true,
  };
  await sentinelRef.set(data);
  return { id: sentinelRef.id, ...data };
}

/* ═══════════════════════════════════════════════════════════════
   GET /api/budgets
═══════════════════════════════════════════════════════════════ */
router.get('/', async (req, res) => {
  try {
    await seedDefaultIfEmpty();
    const snap = await db.collection('budgets').orderBy('createdAt', 'asc').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   GET /api/budgets/:id
═══════════════════════════════════════════════════════════════ */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('budgets').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Budget not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   POST /api/budgets  — create new FY container
═══════════════════════════════════════════════════════════════ */
router.post('/', requireRole('Admin', 'Finance'), [
  body('fy').notEmpty().withMessage('FY label is required e.g. FY 27-28'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // Prevent duplicate FY
    const existing = await db.collection('budgets')
      .where('fy', '==', req.body.fy.trim())
      .limit(1).get();
    if (!existing.empty)
      return res.status(409).json({ error: `Budget for ${req.body.fy} already exists` });

    const data = {
      fy:        req.body.fy.trim(),
      name:      req.body.fy.trim(),
      createdAt: new Date(),
      createdBy: req.user.uid,
      isDefault: false,
    };
    const ref = await db.collection('budgets').add(data);
    await audit({ user: req.user, action: 'Create FY', recordId: ref.id, newValue: data });
    res.status(201).json({ id: ref.id, ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   PATCH /api/budgets/:id
═══════════════════════════════════════════════════════════════ */
router.patch('/:id', requireRole('Admin'), [
  body('fy').optional().notEmpty(),
], async (req, res) => {
  try {
    const ref = db.collection('budgets').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const updates = { updatedAt: new Date() };
    if (req.body.fy) { updates.fy = req.body.fy.trim(); updates.name = req.body.fy.trim(); }
    await ref.update(updates);
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   DELETE /api/budgets/:id  — only if no expenses linked
═══════════════════════════════════════════════════════════════ */
router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try {
    const ref = db.collection('budgets').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    const linked = await db.collection('expenses')
      .where('budgetId', '==', req.params.id).limit(1).get();
    if (!linked.empty)
      return res.status(400).json({ error: 'Cannot delete: expenses exist under this budget' });

    await ref.delete();
    await audit({ user: req.user, action: 'Delete FY', recordId: req.params.id, oldValue: doc.data() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;