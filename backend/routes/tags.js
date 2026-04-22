/**
 * routes/tags.js  — FY 2026-27
 * Tag master CRUD + cascade cleanup on delete.
 *
 * Collection: `tags`
 * Schema: { id, name, color, createdAt, createdBy }
 *
 * Routes:
 *   GET    /api/tags          — list all tags
 *   POST   /api/tags          — create tag
 *   PATCH  /api/tags/:id      — edit name / color
 *   DELETE /api/tags/:id      — delete + cascade-remove from all budget docs
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { db }  = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

/* ── Valid color swatches (matches TagManager.jsx palette) ────── */
const VALID_COLORS = [
  '#1976d2', '#388e3c', '#f57c00', '#d32f2f', '#7b1fa2',
  '#0288d1', '#00796b', '#afb42b', '#5d4037', '#455a64',
  '#c2185b', '#512da8', '#0097a7', '#558b2f', '#e64a19',
];

/* ── audit helper ───────────────────────────────────────────── */
async function audit({ user, action, recordId, oldValue, newValue }) {
  try {
    await db.collection('audit').add({
      user:      user?.name || user?.email || 'Unknown',
      module:    'Tags',
      action,
      recordId:  recordId || null,
      oldValue:  oldValue  != null ? JSON.stringify(oldValue)  : null,
      newValue:  newValue  != null ? JSON.stringify(newValue)  : null,
      timestamp: new Date(),
    });
  } catch { /* never break main flow */ }
}

/* ── GET all ─────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const snap = await db.collection('tags').orderBy('name').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST create ─────────────────────────────────────────────── */
router.post('/', [
  body('name').notEmpty().withMessage('Tag name is required').trim(),
  body('color').optional(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const name  = req.body.name.trim();
    const color = VALID_COLORS.includes(req.body.color) ? req.body.color : VALID_COLORS[0];

    // Prevent duplicate tag names (case-insensitive)
    const existing = await db.collection('tags')
      .where('nameLower', '==', name.toLowerCase())
      .limit(1)
      .get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'A tag with this name already exists' });
    }

    const data = {
      name,
      nameLower:  name.toLowerCase(),
      color,
      createdAt:  new Date(),
      createdBy:  req.user.uid,
    };

    const ref = await db.collection('tags').add(data);
    await audit({ user: req.user, action: 'Create', recordId: ref.id, newValue: data });
    res.status(201).json({ id: ref.id, ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── PATCH update ────────────────────────────────────────────── */
router.patch('/:id', requireRole('Admin', 'Finance'), [
  body('name').optional().notEmpty().trim(),
  body('color').optional(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const ref = db.collection('tags').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Tag not found' });

    const old     = { id: doc.id, ...doc.data() };
    const updates = { updatedAt: new Date() };

    if (req.body.name != null) {
      const name = req.body.name.trim();
      // Check duplicate only if name is actually changing
      if (name.toLowerCase() !== old.nameLower) {
        const existing = await db.collection('tags')
          .where('nameLower', '==', name.toLowerCase())
          .limit(1)
          .get();
        if (!existing.empty) {
          return res.status(409).json({ error: 'A tag with this name already exists' });
        }
      }
      updates.name      = name;
      updates.nameLower = name.toLowerCase();
    }

    if (req.body.color != null) {
      updates.color = VALID_COLORS.includes(req.body.color) ? req.body.color : old.color;
    }

    await ref.update(updates);
    await audit({ user: req.user, action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── DELETE + cascade ────────────────────────────────────────── */
/**
 * Cascade strategy:
 *   1. Remove tagId from budgets.tagIds[]           (top-level expense)
 *   2. Remove tagId from budgets.subTasks[].tagIds  (sub-task level)
 *   Firestore batch writes in chunks of 400 (limit is 500).
 */
router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try {
    const tagId = req.params.id;
    const ref   = db.collection('tags').doc(tagId);
    const doc   = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Tag not found' });
    const old = { id: doc.id, ...doc.data() };

    // Find all budget docs that reference this tag at expense level
    const budgetsWithTag = await db.collection('budgets')
      .where('tagIds', 'array-contains', tagId)
      .get();

    // Firestore FieldValue for array remove
    const { FieldValue } = require('firebase-admin/firestore');

    // Process in batches of 400
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let opCount = 0;

    const flushBatch = async () => {
      if (opCount > 0) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    };

    for (const budgetDoc of budgetsWithTag.docs) {
      const budgetRef = db.collection('budgets').doc(budgetDoc.id);
      const data      = budgetDoc.data();

      // Remove from top-level tagIds
      batch.update(budgetRef, { tagIds: FieldValue.arrayRemove(tagId) });
      opCount++;

      // Remove from subTasks[].tagIds if subTasks array exists
      if (data.subTasks && Array.isArray(data.subTasks)) {
        const updatedSubTasks = data.subTasks.map(st => ({
          ...st,
          tagIds: (st.tagIds || []).filter(t => t !== tagId),
        }));
        batch.update(budgetRef, { subTasks: updatedSubTasks });
        opCount++;
      }

      if (opCount >= BATCH_SIZE) await flushBatch();
    }

    // Also scan budgets where tag is only in subTasks (not in top-level tagIds)
    // These won't be caught by the array-contains query above
    const allBudgetsWithSubTasks = await db.collection('budgets')
      .where('isSubProject', '==', true)
      .get();

    for (const budgetDoc of allBudgetsWithSubTasks.docs) {
      // Skip if already processed above
      if (budgetsWithTag.docs.find(d => d.id === budgetDoc.id)) continue;

      const data = budgetDoc.data();
      if (!data.subTasks || !Array.isArray(data.subTasks)) continue;

      const hasTagInSubTasks = data.subTasks.some(
        st => (st.tagIds || []).includes(tagId)
      );
      if (!hasTagInSubTasks) continue;

      const budgetRef       = db.collection('budgets').doc(budgetDoc.id);
      const updatedSubTasks = data.subTasks.map(st => ({
        ...st,
        tagIds: (st.tagIds || []).filter(t => t !== tagId),
      }));
      batch.update(budgetRef, { subTasks: updatedSubTasks });
      opCount++;

      if (opCount >= BATCH_SIZE) await flushBatch();
    }

    await flushBatch();

    // Finally delete the tag itself
    await ref.delete();
    await audit({ user: req.user, action: 'Delete', recordId: tagId, oldValue: old });

    res.json({
      success: true,
      cascadedBudgets: budgetsWithTag.size,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;