/**
 * routes/transactions.js  — MongoDB
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { Transaction } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient, parseObjectId } = require('../utils/toClient');
const {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} = require('../services/transactionService');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.entityId) filter.entityId = req.query.entityId;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.sourceId) filter.sourceId = req.query.sourceId;
    const rows = await Transaction.find(filter).sort({ createdAt: -1 }).lean();
    res.json(rows.map(toClient));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const doc = await Transaction.findById(oid).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(toClient(doc));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', [
  body('type').isIn(['NFA', 'PO', 'INVOICE', 'PAYMENT']),
  body('entityId').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const tx = await createTransaction({ ...req.body, user: req.user });
    res.status(201).json(tx);
  } catch (e) {
    const status = e.message.includes('NFA') || e.message.includes('PO') || e.message.includes('invoice') ? 422 : 500;
    res.status(status).json({ error: e.message });
  }
});

router.patch('/:id', requireRole('Admin', 'Finance', 'Approver', 'Requestor'), async (req, res) => {
  try {
    const tx = await updateTransaction(req.params.id, req.body, req.user);
    res.json(tx);
  } catch (e) {
    res.status(e.message === 'Transaction not found' ? 404 : 500).json({ error: e.message });
  }
});

router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try {
    await deleteTransaction(req.params.id, req.user);
    res.json({ success: true });
  } catch (e) {
    res.status(e.message === 'Transaction not found' ? 404 : 500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.createTransaction = createTransaction;
