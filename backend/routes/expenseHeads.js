/**
 * routes/expenseHeads.js  — MongoDB
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { Budget, ExpenseHead, ExpenseItem, Task, Transaction, AuditLog } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient, parseObjectId } = require('../utils/toClient');

const router = express.Router();
router.use(auth);

const byCreatedAt = (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0);

async function safeQuery(Model, field, value) {
  try {
    const rows = await Model.find({ [field]: value }).lean();
    return rows.map(toClient);
  } catch {
    return [];
  }
}

async function getExecutionStatus(headId, taskIds) {
  try {
    const entityIds = [headId, ...taskIds];
    const allTx = [];
    for (let i = 0; i < entityIds.length; i += 10) {
      const chunk = entityIds.slice(i, i + 10);
      const snap = await Transaction.find({ entityId: { $in: chunk } }).lean();
      snap.forEach(d => allTx.push(d));
    }
    return {
      nfaApproved: allTx.some(t => t.type === 'NFA' && t.status === 'Approved'),
      poRaised: allTx.some(t => t.type === 'PO'),
      invoiced: allTx.some(t => t.type === 'INVOICE'),
      paid: allTx.some(t => t.type === 'PAYMENT'),
    };
  } catch {
    return { nfaApproved: false, poRaised: false, invoiced: false, paid: false };
  }
}

router.get('/', async (req, res) => {
  try {
    const { budgetId } = req.query;
    if (!budgetId) {
      return res.status(400).json({ success: false, error: 'budgetId is required' });
    }
    const bOid = parseObjectId(budgetId);
    if (!bOid) return res.status(404).json({ success: false, error: 'Budget not found' });
    const budgetDoc = await Budget.findById(bOid).lean();
    if (!budgetDoc) return res.status(404).json({ success: false, error: 'Budget not found' });

    const [heads, items, tasks] = await Promise.all([
      safeQuery(ExpenseHead, 'budgetId', budgetId),
      safeQuery(ExpenseItem, 'budgetId', budgetId),
      safeQuery(Task, 'budgetId', budgetId),
    ]);

    heads.sort(byCreatedAt);

    const enriched = await Promise.all(heads.map(async head => {
      const headItems = items.filter(i => i.expenseHeadId === head.id);
      const headTasks = tasks.filter(t => t.expenseHeadId === head.id);
      const taskIds = headTasks.map(t => t.id);
      const executionStatus = await getExecutionStatus(head.id, taskIds);
      return {
        ...head,
        expenseItemsCount: headItems.length,
        tasksCount: headTasks.length,
        executionStatus,
        expenseItems: headItems.sort(byCreatedAt).map(item => ({
          ...item,
          tasks: tasks.filter(t => t.expenseItemId === item.id).sort(byCreatedAt),
        })),
        directTasks: headTasks.filter(t => !t.expenseItemId).sort(byCreatedAt),
      };
    }));

    return res.status(200).json(enriched);
  } catch (err) {
    console.error('[GET /api/expense-heads]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ success: false, error: 'Not found' });
    const doc = await ExpenseHead.findById(oid).lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json(toClient(doc));
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', requireRole('Admin', 'Finance', 'Requestor'), [
  body('budgetId').notEmpty(),
  body('name').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const bOid = parseObjectId(req.body.budgetId);
    if (!bOid) return res.status(404).json({ success: false, error: 'Budget not found' });
    const budgetDoc = await Budget.findById(bOid).lean();
    if (!budgetDoc) return res.status(404).json({ success: false, error: 'Budget not found' });

    const opexAmount  = Number(req.body.opexAmount)  || 0;
    const capexAmount = Number(req.body.capexAmount) || 0;
    const allocated   = opexAmount + capexAmount || Number(req.body.allocated) || 0;
    const budgetType  = opexAmount > 0 && capexAmount > 0 ? 'Both'
      : capexAmount > 0 ? 'Capex'
      : opexAmount > 0  ? 'Opex'
      : req.body.budgetType || '';

    const data = {
      budgetId: req.body.budgetId,
      name: String(req.body.name).trim(),
      allocated,
      opexAmount,
      capexAmount,
      spent: 0,
      remaining: allocated,
      status: 'Active',
      function: req.body.function || '',
      budgetType,
      category: req.body.category || '',
      spendCategory: req.body.spendCategory || '',
      investmentType: req.body.investmentType || '',
      nfaRequired: req.body.nfaRequired || 'no',
      description: req.body.description || '',
      tagIds: Array.isArray(req.body.tagIds) ? req.body.tagIds : [],
      fy: budgetDoc.fy || '',
      createdAt: new Date(),
      createdBy: req.user?.uid || '',
      createdByName: req.user?.name || req.user?.email || '',
    };

    const ref = await ExpenseHead.create(data);
    try {
      await AuditLog.create({
        user: req.user?.email || 'unknown',
        module: 'ExpenseHead',
        action: 'Create',
        recordId: String(ref._id),
        timestamp: new Date(),
      });
    } catch {}
    return res.status(201).json({ success: true, id: String(ref._id), ...data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id', requireRole('Admin', 'Finance', 'Requestor'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ success: false, error: 'Not found' });
    const doc = await ExpenseHead.findById(oid);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    const old = doc.toObject();
    const updates = { updatedAt: new Date() };
    ['name', 'description', 'function', 'category', 'spendCategory', 'investmentType', 'nfaRequired', 'status']
      .forEach(k => { if (req.body[k] != null) updates[k] = req.body[k]; });

    if (req.body.opexAmount != null || req.body.capexAmount != null) {
      const op  = Number(req.body.opexAmount)  || 0;
      const cap = Number(req.body.capexAmount) || 0;
      updates.opexAmount  = op;
      updates.capexAmount = cap;
      updates.allocated   = op + cap;
      updates.budgetType  = op > 0 && cap > 0 ? 'Both' : cap > 0 ? 'Capex' : op > 0 ? 'Opex' : '';
      updates.remaining   = updates.allocated - (old.spent || 0);
      updates.status      = updates.remaining < 0 ? 'Overrun' : 'Active';
    } else {
      if (req.body.budgetType != null) updates.budgetType = req.body.budgetType;
      if (req.body.allocated  != null) {
        updates.allocated = Number(req.body.allocated);
        updates.remaining = updates.allocated - (old.spent || 0);
        updates.status    = updates.remaining < 0 ? 'Overrun' : 'Active';
      }
    }
    if (req.body.tagIds != null) updates.tagIds = Array.isArray(req.body.tagIds) ? req.body.tagIds : [];
    doc.set(updates);
    await doc.save();
    return res.status(200).json({ success: true, ...toClient(doc) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ success: false, error: 'Not found' });
    const doc = await ExpenseHead.findByIdAndDelete(oid);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
