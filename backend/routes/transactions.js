/**
 * routes/transactions.js  — MongoDB
 */
const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { Transaction } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient, parseObjectId } = require('../utils/toClient');
const { uploadPdf } = require('../services/gcs');
const {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} = require('../services/transactionService');

const router = express.Router();
router.use(auth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

/** Upload a PDF to GCS and create a transaction with the durable /uploads URL (no base64). */
router.post('/upload', requireRole('Admin', 'Finance', 'Requestor', 'Approver'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file || req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'PDF file required' });
    }
    const { type, entityId, entityType, amount, description, status } = req.body;
    if (!type || !entityId) return res.status(400).json({ error: 'type and entityId required' });

    const folder =
      type === 'PO' ? 'po-pdfs' :
      type === 'INVOICE' ? 'invoice-pdfs' :
      type === 'PAYMENT' ? 'payment-pdfs' : 'nfa-pdfs';

    const fileUrl = await uploadPdf(folder, req.file.buffer, req.file.originalname);
    const tx = await createTransaction({
      type,
      entityId,
      entityType: entityType || 'Budget',
      amount: Number(amount) || 0,
      description: description || req.file.originalname,
      fileUrl,
      fileName: req.file.originalname,
      status: status || 'Submitted',
      user: req.user,
    });
    res.status(201).json(tx);
  } catch (e) {
    const statusCode = e.message.includes('NFA') || e.message.includes('PO') || e.message.includes('invoice') ? 422 : 500;
    res.status(statusCode).json({ error: e.message });
  }
});

router.post('/', [
  body('type').isIn(['NFA', 'PO', 'INVOICE', 'PAYMENT']),
  body('entityId').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // Reject large base64 data URLs — PDFs must go through /upload → GCS
    if (typeof req.body.fileUrl === 'string' && req.body.fileUrl.startsWith('data:')) {
      return res.status(400).json({ error: 'Upload PDF via /api/transactions/upload (GCS). Base64 fileUrl is not allowed.' });
    }

    const tx = await createTransaction({ ...req.body, user: req.user });
    res.status(201).json(tx);
  } catch (e) {
    const statusCode = e.message.includes('NFA') || e.message.includes('PO') || e.message.includes('invoice') ? 422 : 500;
    res.status(statusCode).json({ error: e.message });
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
