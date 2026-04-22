/**
 * routes/expenseHeads.js
 * Mounted at: /api/expense-heads
 * Firestore collection: expenses
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { db }  = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');
const { buildHierarchy, computeRollup, writeAudit } = require('../services/transactionService');

const router = express.Router();
router.use(auth);

/* GET /api/expense-heads?budgetId= — full nested hierarchy */
router.get('/', async (req, res) => {
  try {
    const { budgetId } = req.query;
    if (!budgetId) return res.status(400).json({ error: 'budgetId query param is required' });
    const budgetDoc = await db.collection('budgets').doc(budgetId).get();
    if (!budgetDoc.exists) return res.status(404).json({ error: 'Budget not found' });
    const hierarchy = await buildHierarchy(budgetId);
    res.json(hierarchy);
  } catch (e) {
    console.error('GET /api/expense-heads error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/expense-heads/:id */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('expenses').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Expense Head not found' });
    const rollup = await computeRollup(doc.id);
    res.json({ id: doc.id, ...doc.data(), ...rollup });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/expense-heads */
router.post('/', requireRole('Admin', 'Finance'), [
  body('budgetId').notEmpty().withMessage('budgetId is required'),
  body('name').notEmpty().withMessage('name is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const budgetDoc = await db.collection('budgets').doc(req.body.budgetId).get();
    if (!budgetDoc.exists) return res.status(404).json({ error: 'Budget not found' });

    const data = {
      budgetId:      req.body.budgetId,
      name:          req.body.name.trim(),
      allocated:     Number(req.body.allocated)     || 0,
      spent:         0,
      remaining:     Number(req.body.allocated)     || 0,
      status:        'Active',
      function:      req.body.function              || '',
      budgetType:    req.body.budgetType            || '',
      category:      req.body.category              || '',
      spendCategory: req.body.spendCategory         || '',
      investmentType:req.body.investmentType        || '',
      nfaRequired:   req.body.nfaRequired           || 'no',
      description:   req.body.description           || '',
      tagIds:        Array.isArray(req.body.tagIds) ? req.body.tagIds : [],
      fy:            budgetDoc.data().fy,
      createdAt:     new Date(),
      createdBy:     req.user.uid,
      createdByName: req.user.name || req.user.email,
    };

    const ref = await db.collection('expenses').add(data);
    await writeAudit({ user: req.user, module: 'ExpenseHead', action: 'Create', recordId: ref.id, newValue: data });
    res.status(201).json({ id: ref.id, ...data });
  } catch (e) {
    console.error('POST /api/expense-heads error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* PATCH /api/expense-heads/:id */
router.patch('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const ref = db.collection('expenses').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Expense Head not found' });

    const old     = { id: doc.id, ...doc.data() };
    const updates = { updatedAt: new Date() };
    const editableFields = ['name','description','function','budgetType','category','spendCategory','investmentType','nfaRequired','status'];
    editableFields.forEach(k => { if (req.body[k] != null) updates[k] = req.body[k]; });
    if (req.body.allocated != null) {
      updates.allocated = Number(req.body.allocated);
      updates.remaining = updates.allocated - (old.spent || 0);
      updates.status    = updates.remaining < 0 ? 'Overrun' : 'Active';
    }
    if (req.body.tagIds != null) updates.tagIds = Array.isArray(req.body.tagIds) ? req.body.tagIds : [];

    await ref.update(updates);
    await writeAudit({ user: req.user, module: 'ExpenseHead', action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    const updated = await ref.get();
    const rollup  = await computeRollup(req.params.id);
    res.json({ id: updated.id, ...updated.data(), ...rollup });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* DELETE /api/expense-heads/:id */
router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const ref = db.collection('expenses').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Expense Head not found' });
    const old = { id: doc.id, ...doc.data() };
    const [itemSnap, taskSnap] = await Promise.all([
      db.collection('subExpenses').where('expenseId', '==', req.params.id).limit(1).get(),
      db.collection('subTasks').where('expenseId',    '==', req.params.id).limit(1).get(),
    ]);
    await ref.delete();
    await writeAudit({ user: req.user, module: 'ExpenseHead', action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true, hadChildren: !itemSnap.empty || !taskSnap.empty });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;