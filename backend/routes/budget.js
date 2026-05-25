/**
 * routes/budget.js  — FY Container (MongoDB)
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { Budget, AuditLog, Expense, ExpenseHead } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient, parseObjectId } = require('../utils/toClient');

const router = express.Router();
router.use(auth);

const DEFAULT_FY = 'FY 26-27';

async function audit({ user, action, recordId, newValue, oldValue }) {
  try {
    await AuditLog.create({
      user: user?.name || user?.email || 'Unknown',
      module: 'Budget',
      action,
      recordId: recordId || null,
      oldValue: oldValue != null ? JSON.stringify(oldValue) : null,
      newValue: newValue != null ? JSON.stringify(newValue) : null,
      timestamp: new Date(),
    });
  } catch {}
}

async function seedDefaultIfEmpty() {
  const existing = await Budget.findOne({ fy: DEFAULT_FY }).lean();
  if (existing) return toClient(existing);
  try {
    const created = await Budget.create({
      fy: DEFAULT_FY,
      name: DEFAULT_FY,
      createdAt: new Date(),
      isDefault: true,
    });
    return toClient(created);
  } catch (e) {
    const again = await Budget.findOne({ fy: DEFAULT_FY }).lean();
    if (again) return toClient(again);
    throw e;
  }
}

router.get('/', async (req, res) => {
  try {
    await seedDefaultIfEmpty();
    const rows = await Budget.find().lean();
    const docs = rows.map(toClient);
    docs.sort((a, b) => {
      const ta = new Date(a.createdAt || 0);
      const tb = new Date(b.createdAt || 0);
      return ta - tb;
    });
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Budget not found' });
    const doc = await Budget.findById(oid).lean();
    if (!doc) return res.status(404).json({ error: 'Budget not found' });
    res.json(toClient(doc));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireRole('Admin', 'Finance'), [
  body('fy').notEmpty().withMessage('FY label is required e.g. FY 27-28'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const fy = req.body.fy.trim();
    const dup = await Budget.findOne({ fy }).lean();
    if (dup) return res.status(409).json({ error: `Budget for ${fy} already exists` });

    const data = {
      fy,
      name: fy,
      createdAt: new Date(),
      createdBy: req.user.uid,
      isDefault: false,
    };
    const created = await Budget.create(data);
    await audit({ user: req.user, action: 'Create FY', recordId: String(created._id), newValue: data });
    res.status(201).json(toClient(created));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireRole('Admin'), [
  body('fy').optional().notEmpty(),
], async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const doc = await Budget.findById(oid);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const updates = { updatedAt: new Date() };
    if (req.body.fy) {
      updates.fy = req.body.fy.trim();
      updates.name = req.body.fy.trim();
    }
    Object.assign(doc, updates);
    await doc.save();
    res.json(toClient(doc));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const doc = await Budget.findById(oid);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const linked = await Expense.findOne({ budgetId: req.params.id }).lean();
    if (linked) {
      return res.status(400).json({ error: 'Cannot delete: expenses exist under this budget' });
    }
    const headLinked = await ExpenseHead.findOne({ budgetId: req.params.id }).lean();
    if (headLinked) {
      return res.status(400).json({ error: 'Cannot delete: expense heads exist under this budget' });
    }

    await Budget.deleteOne({ _id: oid });
    await audit({ user: req.user, action: 'Delete FY', recordId: req.params.id, oldValue: toClient(doc) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
