/**
 * routes/transactions.js
 * Mounted at: /api/transactions
 * All logic delegated to transactionService
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { db }  = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');
const {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionsForEntity,
} = require('../services/transactionService');

const router = express.Router();
router.use(auth);

/* GET /api/transactions?entityId=&type= */
router.get('/', async (req, res) => {
  try {
    let q = db.collection('transactions').orderBy('createdAt', 'desc');
    if (req.query.entityId) q = q.where('entityId', '==', req.query.entityId);
    if (req.query.type)     q = q.where('type',     '==', req.query.type);
    if (req.query.sourceId) q = q.where('sourceId', '==', req.query.sourceId);
    const snap = await q.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/transactions/:id */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('transactions').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/transactions */
router.post('/', [
  body('type').isIn(['NFA','PO','INVOICE','PAYMENT']),
  body('entityId').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const tx = await createTransaction({ ...req.body, user: req.user });
    res.status(201).json(tx);
  } catch (e) {
    // Stage validation errors are user-facing
    const status = e.message.includes('NFA') || e.message.includes('PO') || e.message.includes('invoice') ? 422 : 500;
    res.status(status).json({ error: e.message });
  }
});

/* PATCH /api/transactions/:id */
router.patch('/:id', requireRole('Admin', 'Finance', 'Approver', 'Requestor'), async (req, res) => {
  try {
    const tx = await updateTransaction(req.params.id, req.body, req.user);
    res.json(tx);
  } catch (e) {
    res.status(e.message === 'Transaction not found' ? 404 : 500).json({ error: e.message });
  }
});

/* DELETE /api/transactions/:id */
router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try {
    await deleteTransaction(req.params.id, req.user);
    res.json({ success: true });
  } catch (e) {
    res.status(e.message === 'Transaction not found' ? 404 : 500).json({ error: e.message });
  }
});

// Export createTransaction for use by other routes
module.exports = router;
module.exports.createTransaction = createTransaction;