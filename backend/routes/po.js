/**
 * routes/po.js  — MongoDB
 */
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { PO, Approval, ExpenseHead, Invoice, AuditLog } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient, parseObjectId } = require('../utils/toClient');
const { parsePOPDF } = require('../services/gemini');

const router = express.Router();
router.use(auth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const uploadDir = path.join(__dirname, '..', 'uploads', 'po-pdfs');

async function writeAudit(user, action, recordId, newValue) {
  try {
    await AuditLog.create({
      user: user?.name || user?.email || 'unknown',
      module: 'PO',
      action,
      recordId: recordId || null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      timestamp: new Date(),
    });
  } catch {}
}

async function savePdf(buffer, originalName) {
  await fs.mkdir(uploadDir, { recursive: true });
  const safe = `${Date.now()}_${String(originalName).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')}`;
  await fs.writeFile(path.join(uploadDir, safe), buffer);
  return `/uploads/po-pdfs/${safe}`;
}

router.post('/parse', requireRole('Admin', 'Finance', 'Requestor'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file required' });
    const extracted = await parsePOPDF(req.file.buffer);
    return res.status(200).json(extracted);
  } catch (e) {
    console.error('[POST /api/pos/parse]', e.message);
    return res.status(500).json({ error: e.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.expenseHeadId) filter.expenseHeadId = req.query.expenseHeadId;
    if (req.query.nfaId) filter.nfaId = req.query.nfaId;
    if (req.query.entityId) filter.entityId = req.query.entityId;
    if (req.query.status) filter.status = req.query.status;
    const rows = await PO.find(filter).lean();
    const docs = rows.map(toClient);
    docs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return res.status(200).json(docs);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'PO not found' });
    const doc = await PO.findById(oid).lean();
    if (!doc) return res.status(404).json({ error: 'PO not found' });
    return res.status(200).json(toClient(doc));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', requireRole('Admin', 'Finance', 'Requestor'), [
  body('expenseHeadId').notEmpty().withMessage('expenseHeadId is required'),
  body('nfaId').notEmpty().withMessage('nfaId is required — PO requires an approved NFA'),
  body('vendorName').notEmpty().withMessage('vendorName is required'),
  body('amount').isFloat({ min: 0 }).withMessage('amount must be a positive number'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const nfaOid = parseObjectId(req.body.nfaId);
    if (!nfaOid) return res.status(404).json({ error: 'NFA not found' });
    const nfaDoc = await Approval.findById(nfaOid).lean();
    if (!nfaDoc) return res.status(404).json({ error: 'NFA not found' });
    if (nfaDoc.status !== 'Approved') {
      return res.status(422).json({ error: 'NFA must be Approved before raising a PO.' });
    }

    const hOid = parseObjectId(req.body.expenseHeadId);
    if (!hOid) return res.status(404).json({ error: 'Expense Head not found' });
    const headDoc = await ExpenseHead.findById(hOid).lean();
    if (!headDoc) return res.status(404).json({ error: 'Expense Head not found' });

    const data = {
      expenseHeadId: req.body.expenseHeadId,
      nfaId: req.body.nfaId,
      nfaNumber: nfaDoc.nfaNumber || '',
      entityId: req.body.expenseHeadId,
      entityType: 'expenseHead',
      vendorName: req.body.vendorName,
      amount: Number(req.body.amount),
      poNumber: req.body.poNumber || '',
      description: req.body.description || '',
      status: req.body.status || 'Draft',
      invoices: [],
      pdfUrl: null,
      pdfName: null,
      createdAt: new Date(),
      createdBy: req.user?.uid,
      createdByName: req.user?.name || req.user?.email,
    };

    const ref = await PO.create(data);
    await writeAudit(req.user, 'Create', String(ref._id), { poNumber: data.poNumber, vendorName: data.vendorName });
    return res.status(201).json({ id: String(ref._id), ...data });
  } catch (e) {
    console.error('[POST /api/pos]', e.message);
    return res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'PO not found' });
    const doc = await PO.findById(oid);
    if (!doc) return res.status(404).json({ error: 'PO not found' });

    const updates = { updatedAt: new Date() };
    ['vendorName', 'poNumber', 'description', 'status'].forEach(k => {
      if (req.body[k] != null) updates[k] = req.body[k];
    });
    if (req.body.amount != null) updates.amount = Number(req.body.amount);
    Object.assign(doc, updates);
    await doc.save();
    await writeAudit(req.user, 'Edit', req.params.id, updates);
    return res.status(200).json(toClient(doc));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'PO not found' });
    const doc = await PO.findById(oid);
    if (!doc) return res.status(404).json({ error: 'PO not found' });

    const linked = await Invoice.findOne({ poId: req.params.id }).lean();
    if (linked) return res.status(400).json({ error: 'Cannot delete PO — invoices are linked to it.' });

    await PO.deleteOne({ _id: oid });
    await writeAudit(req.user, 'Delete', req.params.id, null);
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/upload', requireRole('Admin', 'Finance', 'Requestor'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });
    const url = await savePdf(req.file.buffer, req.file.originalname);
    const fileName = req.file.originalname;

    if (req.body.poId) {
      const pOid = parseObjectId(req.body.poId);
      if (pOid) {
        const doc = await PO.findById(pOid);
        if (doc) {
          doc.pdfUrl = url;
          doc.pdfName = fileName;
          doc.updatedAt = new Date();
          await doc.save();
          await writeAudit(req.user, 'Upload PDF', req.body.poId, { pdfName: fileName });
        }
      }
    }
    return res.status(200).json({ url, fileUrl: url, name: fileName });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/:id/invoices', requireRole('Admin', 'Finance', 'Requestor'), [
  body('vendorName').notEmpty(),
  body('amount').isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'PO not found' });
    const doc = await PO.findById(oid);
    if (!doc) return res.status(404).json({ error: 'PO not found' });

    const invoice = {
      id: `inv_${Date.now()}`,
      vendorName: req.body.vendorName,
      invoiceNumber: req.body.invoiceNumber || '',
      amount: Number(req.body.amount) || 0,
      tax: Number(req.body.tax) || 0,
      date: req.body.date || new Date().toISOString().slice(0, 10),
      status: 'Pending',
      createdAt: new Date().toISOString(),
      createdBy: req.user?.uid,
    };
    doc.invoices = [...(doc.invoices || []), invoice];
    doc.updatedAt = new Date();
    await doc.save();
    const updated = await PO.findById(oid);
    return res.status(201).json(toClient(updated));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
