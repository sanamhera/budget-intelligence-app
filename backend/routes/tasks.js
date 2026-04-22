/**
 * routes/tasks.js
 * Mounted at: /api/tasks
 * Firestore collection: subTasks
 *
 * parentType: "expense" | "subExpense"
 * expenseId always set (root Expense Head)
 * subExpenseId set only when parentType === "subExpense"
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { db }  = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');
const { computeRollup, writeAudit } = require('../services/transactionService');

const router = express.Router();
router.use(auth);

/* GET /api/tasks?expenseId= or ?subExpenseId= */
router.get('/', async (req, res) => {
  try {
    const { expenseId, subExpenseId } = req.query;
    if (!expenseId && !subExpenseId)
      return res.status(400).json({ error: 'expenseId or subExpenseId query param required' });

    let q = db.collection('subTasks').orderBy('createdAt', 'asc');
    if (subExpenseId) q = q.where('subExpenseId', '==', subExpenseId);
    else              q = q.where('expenseId',    '==', expenseId);

    const snap = await q.get();
    const rows = await Promise.all(snap.docs.map(async d => {
      const rollup = await computeRollup(d.id);
      return { id: d.id, ...d.data(), ...rollup };
    }));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/tasks/:id */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('subTasks').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Task not found' });
    const rollup = await computeRollup(doc.id);
    res.json({ id: doc.id, ...doc.data(), ...rollup });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/tasks */
router.post('/', requireRole('Admin', 'Finance', 'Requestor'), [
  body('name').notEmpty().withMessage('name is required'),
  body('expenseId').notEmpty().withMessage('expenseId is required'),
  body('parentType').isIn(['expense','subExpense']).withMessage('parentType must be expense or subExpense'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { parentType, expenseId, subExpenseId } = req.body;

    const expenseDoc = await db.collection('expenses').doc(expenseId).get();
    if (!expenseDoc.exists) return res.status(404).json({ error: 'Expense Head not found' });

    let resolvedSubExpenseId = null;
    if (parentType === 'subExpense') {
      if (!subExpenseId) return res.status(400).json({ error: 'subExpenseId required when parentType is subExpense' });
      const seDoc = await db.collection('subExpenses').doc(subExpenseId).get();
      if (!seDoc.exists) return res.status(404).json({ error: 'Expense Item not found' });
      resolvedSubExpenseId = subExpenseId;
    }

    const data = {
      budgetId:      expenseDoc.data().budgetId,
      expenseId,
      subExpenseId:  resolvedSubExpenseId,
      parentType,
      name:          req.body.name.trim(),
      allocated:     Number(req.body.allocated) || 0,
      spent:         0,
      remaining:     Number(req.body.allocated) || 0,
      status:        'Active',
      nfaRequired:   req.body.nfaRequired || 'no',
      description:   req.body.description || '',
      tagIds:        Array.isArray(req.body.tagIds) ? req.body.tagIds : [],
      createdAt:     new Date(),
      createdBy:     req.user.uid,
      createdByName: req.user.name || req.user.email,
    };

    const ref = await db.collection('subTasks').add(data);
    await writeAudit({ user: req.user, module: 'Task', action: 'Create', recordId: ref.id, newValue: data });
    res.status(201).json({ id: ref.id, ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* PATCH /api/tasks/:id */
router.patch('/:id', requireRole('Admin', 'Finance', 'Requestor'), async (req, res) => {
  try {
    const ref = db.collection('subTasks').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Task not found' });

    const old     = { id: doc.id, ...doc.data() };
    const updates = { updatedAt: new Date() };
    ['name','description','nfaRequired','status'].forEach(k => { if (req.body[k] != null) updates[k] = req.body[k]; });
    if (req.body.allocated != null) {
      updates.allocated = Number(req.body.allocated);
      updates.remaining = updates.allocated - (old.spent || 0);
      updates.status    = updates.remaining < 0 ? 'Overrun' : 'Active';
    }
    if (req.body.tagIds != null) updates.tagIds = Array.isArray(req.body.tagIds) ? req.body.tagIds : [];

    await ref.update(updates);
    await writeAudit({ user: req.user, module: 'Task', action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    const updated = await ref.get();
    const rollup  = await computeRollup(req.params.id);
    res.json({ id: updated.id, ...updated.data(), ...rollup });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* DELETE /api/tasks/:id */
router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const ref = db.collection('subTasks').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Task not found' });
    const old = { id: doc.id, ...doc.data() };
    await ref.delete();
    await writeAudit({ user: req.user, module: 'Task', action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;