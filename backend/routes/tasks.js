/**
 * routes/tasks.js  — MongoDB
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { ExpenseHead, ExpenseItem, Task, AuditLog } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient, parseObjectId } = require('../utils/toClient');

const router = express.Router();
router.use(auth);

const byCreatedAt = (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0);

async function audit(user, action, recordId, data) {
  try {
    await AuditLog.create({
      user: user?.name || user?.email || user?.uid || 'unknown',
      module: 'Task',
      action,
      recordId: recordId || null,
      newValue: data ? JSON.stringify(data) : null,
      timestamp: new Date(),
    });
  } catch {}
}

router.get('/', async (req, res) => {
  try {
    const { expenseHeadId, expenseItemId } = req.query;
    if (!expenseHeadId && !expenseItemId) {
      return res.status(400).json({ success: false, error: 'expenseHeadId or expenseItemId required' });
    }
    const filter = expenseItemId ? { expenseItemId } : { expenseHeadId };
    const rows = await Task.find(filter).lean();
    return res.status(200).json(rows.map(toClient).sort(byCreatedAt));
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ success: false, error: 'Task not found' });
    const doc = await Task.findById(oid).lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Task not found' });
    return res.status(200).json(toClient(doc));
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/',
  requireRole('Admin', 'Finance', 'Requestor'),
  [
    body('name').notEmpty().withMessage('name is required'),
    body('expenseHeadId').notEmpty().withMessage('expenseHeadId is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { expenseHeadId, expenseItemId } = req.body;
      const hOid = parseObjectId(expenseHeadId);
      if (!hOid) {
        return res.status(404).json({ success: false, error: `Expense Head not found: ${expenseHeadId}` });
      }
      const headDoc = await ExpenseHead.findById(hOid);
      if (!headDoc) {
        return res.status(404).json({ success: false, error: `Expense Head not found: ${expenseHeadId}` });
      }

      if (expenseItemId) {
        const iOid = parseObjectId(expenseItemId);
        if (!iOid) {
          return res.status(404).json({ success: false, error: `Expense Item not found: ${expenseItemId}` });
        }
        const itemDoc = await ExpenseItem.findById(iOid);
        if (!itemDoc) {
          return res.status(404).json({ success: false, error: `Expense Item not found: ${expenseItemId}` });
        }
      }

      const data = {
        budgetId: headDoc.budgetId || '',
        expenseHeadId,
        expenseItemId: expenseItemId || null,
        name: String(req.body.name).trim(),
        allocated: Number(req.body.allocated) || 0,
        spent: 0,
        remaining: Number(req.body.allocated) || 0,
        status: 'Active',
        nfaRequired: req.body.nfaRequired || 'no',
        description: req.body.description || '',
        tagIds: Array.isArray(req.body.tagIds) ? req.body.tagIds : [],
        createdAt: new Date(),
        createdBy: req.user?.uid || 'unknown',
        createdByName: req.user?.name || req.user?.email || 'unknown',
      };

      const ref = await Task.create(data);
      await audit(req.user, 'Create', String(ref._id), { name: data.name, expenseHeadId, expenseItemId });
      return res.status(201).json({ success: true, id: String(ref._id), ...data });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.patch('/:id', requireRole('Admin', 'Finance', 'Requestor'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ success: false, error: 'Task not found' });
    const doc = await Task.findById(oid);
    if (!doc) return res.status(404).json({ success: false, error: 'Task not found' });
    const old = doc.toObject();
    const updates = { updatedAt: new Date() };
    ['name', 'description', 'nfaRequired', 'status'].forEach(k => {
      if (req.body[k] != null) updates[k] = req.body[k];
    });
    if (req.body.allocated != null) {
      updates.allocated = Number(req.body.allocated);
      updates.remaining = updates.allocated - (old.spent || 0);
      updates.status = updates.remaining < 0 ? 'Overrun' : 'Active';
    }
    if (req.body.tagIds != null) updates.tagIds = Array.isArray(req.body.tagIds) ? req.body.tagIds : [];
    Object.assign(doc, updates);
    await doc.save();
    await audit(req.user, 'Edit', req.params.id, updates);
    return res.status(200).json({ success: true, ...toClient(doc) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ success: false, error: 'Task not found' });
    const doc = await Task.findByIdAndDelete(oid);
    if (!doc) return res.status(404).json({ success: false, error: 'Task not found' });
    await audit(req.user, 'Delete', req.params.id, null);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
