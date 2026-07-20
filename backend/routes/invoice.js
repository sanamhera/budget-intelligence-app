/**
 * routes/invoice.js  — MongoDB; invoice PDFs stored in GCS
 */
const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { Budget, Invoice, AuditLog, Transaction, GlCode, Payment } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { parseInvoicePDF } = require('../services/gemini');
const { getVendorGL, saveVendorGL } = require('../utils/vendorGL');
const { createTransaction } = require('../services/transactionService');
const { toClient, parseObjectId } = require('../utils/toClient');
const { uploadPdf } = require('../services/gcs');

const router = express.Router();
router.use(auth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function audit({ user, module: mod, action, recordId, oldValue, newValue }) {
  try {
    await AuditLog.create({
      user: user?.name || user?.email || 'Unknown',
      module: mod,
      action,
      recordId: recordId || null,
      oldValue: oldValue != null ? JSON.stringify(oldValue) : null,
      newValue: newValue != null ? JSON.stringify(newValue) : null,
      timestamp: new Date(),
    });
  } catch {}
}

async function adjustBudgetSpent(budgetId, delta) {
  if (!budgetId || delta === 0) return;
  const oid = parseObjectId(budgetId);
  if (!oid) return;
  const doc = await Budget.findById(oid);
  if (!doc) return;
  const d = doc.toObject();
  const spent = Math.max(0, (d.spent || 0) + delta);
  const allocated = d.allocated || 0;
  doc.spent = spent;
  doc.remaining = allocated - spent;
  doc.status = spent > allocated ? 'Overrun' : 'Active';
  doc.updatedAt = new Date();
  await doc.save();
}

async function syncInvoiceTransaction(sourceId, updates) {
  if (!sourceId) return;
  try {
    await Transaction.findOneAndUpdate(
      { sourceId: String(sourceId), type: 'INVOICE' },
      { $set: { ...updates, updatedAt: new Date() } }
    );
  } catch {}
}

router.get('/', async (req, res) => {
  try {
    const { budgetId, expenseHeadId, nfaId, poId } = req.query;
    const filter = {};
    if (budgetId) filter.budgetId = budgetId;
    if (expenseHeadId) filter.expenseHeadId = expenseHeadId;
    if (nfaId) filter.nfaId = nfaId;
    if (poId) filter.poId = poId;
    const rows = await Invoice.find(filter).lean();
    const docs = rows.map(toClient);
    docs.sort((a, b) => {
      const ta = new Date(a.createdAt || 0);
      const tb = new Date(b.createdAt || 0);
      return tb - ta;
    });
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const doc = await Invoice.findById(oid).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(toClient(doc));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/upload', requireRole('Admin', 'Requestor', 'Finance'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file || req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'PDF file required' });
    }
    const { budgetId } = req.body;
    if (!budgetId) return res.status(400).json({ error: 'budgetId required' });
    const bOid = parseObjectId(budgetId);
    if (!bOid) return res.status(404).json({ error: 'Budget not found' });
    const budgetSnap = await Budget.findById(bOid).lean();
    if (!budgetSnap) return res.status(404).json({ error: 'Budget not found' });

    const glRows = await GlCode.find({ active: true }).lean();
    const glList = glRows.map(d => ({ code: d.code, name: d.name }));

    const extracted = await parseInvoicePDF(req.file.buffer, glList);
    const vendorGL = await getVendorGL(extracted.vendorName);
    if (vendorGL && extracted.lineItems?.length) extracted.lineItems[0].glCode = vendorGL;

    const fileUrl = await uploadPdf('invoice-pdfs', req.file.buffer, req.file.originalname);

    res.json({
      preview: {
        budgetId,
        fileName: req.file.originalname,
        fileUrl,
        pdfUrl: fileUrl,
        vendorName: extracted.vendorName,
        invoiceNumber: extracted.invoiceNumber,
        amount: extracted.amount,
        tax: extracted.tax,
        date: extracted.date || new Date().toISOString().slice(0, 10),
        dueDate: extracted.dueDate || '',
        lineItems: extracted.lineItems || [],
      },
    });
  } catch (e) {
    console.error('UPLOAD ERROR:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/confirm', requireRole('Admin', 'Requestor', 'Finance'), async (req, res) => {
  try {
    const invoice = req.body;
    const totalAmount = Number(invoice.amount || 0) + Number(invoice.tax || 0);

    const ref = await Invoice.create({
      ...invoice,
      lineItems: invoice.lineItems || [],
      amount: Number(invoice.amount),
      tax: Number(invoice.tax) || 0,
      expenseHeadId: invoice.expenseHeadId || null,
      expenseItemId: invoice.expenseItemId || null,
      taskId: invoice.taskId || null,
      nfaId: invoice.nfaId || null,
      nfaNumber: invoice.nfaNumber || null,
      poId: invoice.poId || null,
      poNumber: invoice.poNumber || null,
      fileUrl: invoice.fileUrl || invoice.pdfUrl || null,
      pdfUrl: invoice.fileUrl || invoice.pdfUrl || null,
      fileName: invoice.fileName || null,
      status: 'Pending',
      paidAmount: 0,
      createdAt: new Date(),
      createdBy: req.user.uid,
    });

    const firstGL = invoice.lineItems?.[0]?.glCode;
    if (firstGL) await saveVendorGL(invoice.vendorName, firstGL);

    const invId = String(ref._id);
    await createTransaction({
      type: 'INVOICE',
      entityId: invoice.budgetId,
      entityType: 'Budget',
      vendorName: invoice.vendorName || '',
      amount: totalAmount,
      description: invoice.invoiceNumber ? `Invoice #${invoice.invoiceNumber}` : 'Invoice',
      status: 'Pending',
      sourceId: invId,
      fileUrl: invoice.fileUrl || invoice.pdfUrl || null,
      fileName: invoice.fileName || null,
      user: req.user,
    });

    await audit({
      user: req.user,
      module: 'Invoice',
      action: 'Create via Upload',
      recordId: invId,
      newValue: { vendorName: invoice.vendorName, amount: invoice.amount },
    });
    res.status(201).json({ success: true, id: invId });
  } catch (e) {
    console.error('CONFIRM ERROR:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireRole('Admin', 'Requestor', 'Finance'), [
  body('budgetId').notEmpty(),
  body('vendorName').notEmpty(),
  body('amount').isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bOid = parseObjectId(req.body.budgetId);
    if (!bOid) return res.status(404).json({ error: 'Budget not found' });
    const budgetSnap = await Budget.findById(bOid).lean();
    if (!budgetSnap) return res.status(404).json({ error: 'Budget not found' });

    const invoice = {
      ...req.body,
      amount: Number(req.body.amount),
      tax: Number(req.body.tax) || 0,
      expenseHeadId: req.body.expenseHeadId || null,
      expenseItemId: req.body.expenseItemId || null,
      taskId: req.body.taskId || null,
      nfaId: req.body.nfaId || null,
      nfaNumber: req.body.nfaNumber || null,
      poId: req.body.poId || null,
      poNumber: req.body.poNumber || null,
      status: 'Pending',
      paidAmount: 0,
      createdAt: new Date(),
      createdBy: req.user.uid,
    };

    const ref = await Invoice.create(invoice);
    const invId = String(ref._id);
    const totalAmount = invoice.amount + invoice.tax;
    await createTransaction({
      type: 'INVOICE',
      entityId: invoice.budgetId,
      entityType: 'Budget',
      vendorName: invoice.vendorName || '',
      amount: totalAmount,
      description: invoice.invoiceNumber ? `Invoice #${invoice.invoiceNumber}` : 'Invoice',
      status: 'Pending',
      sourceId: invId,
      user: req.user,
    });

    await audit({ user: req.user, module: 'Invoice', action: 'Create', recordId: invId, newValue: invoice });
    res.status(201).json(toClient(ref));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireRole('Admin', 'Finance'), [
  body('vendorName').optional().notEmpty(),
  body('amount').optional().isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const ref = await Invoice.findById(oid);
    if (!ref) return res.status(404).json({ error: 'Not found' });

    const old = toClient(ref.toObject());
    const updates = { updatedAt: new Date() };
    const editableFields = [
      'vendorName', 'invoiceNumber', 'date', 'dueDate', 'glCode', 'budgetId', 'status',
      'expenseHeadId', 'expenseItemId', 'taskId', 'nfaId', 'nfaNumber', 'poId', 'poNumber', 'costCentre',
    ];
    editableFields.forEach(k => {
      if (req.body[k] != null) updates[k] = req.body[k];
    });
    if (req.body.amount != null) updates.amount = Number(req.body.amount);
    if (req.body.tax != null) updates.tax = Number(req.body.tax);

    const oldTotal = (old.amount || 0) + (old.tax || 0);
    const newTotal = (updates.amount ?? old.amount ?? 0) + (updates.tax ?? old.tax ?? 0);
    const delta = newTotal - oldTotal;

    if (updates.budgetId && updates.budgetId !== old.budgetId) {
      await adjustBudgetSpent(old.budgetId, -oldTotal);
      await adjustBudgetSpent(updates.budgetId, newTotal);
    } else if (delta !== 0) {
      await adjustBudgetSpent(old.budgetId, delta);
    }

    Object.assign(ref, updates);
    await ref.save();

    const txSync = {};
    if (updates.status != null) txSync.status = updates.status;
    if (updates.vendorName != null) txSync.vendorName = updates.vendorName;
    if (delta !== 0) txSync.amount = newTotal;
    if (Object.keys(txSync).length) await syncInvoiceTransaction(req.params.id, txSync);

    await audit({
      user: req.user,
      module: 'Invoice',
      action: 'Edit',
      recordId: req.params.id,
      oldValue: old,
      newValue: updates,
    });
    res.json(toClient(ref));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const ref = await Invoice.findById(oid);
    if (!ref) return res.status(404).json({ error: 'Not found' });
    const old = toClient(ref.toObject());

    // Reverse all payments for this invoice (budget.spent is only incremented by payments)
    const relatedPayments = await Payment.find({ invoiceId: req.params.id }).lean();
    const totalPaid = relatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
    if (totalPaid > 0) await adjustBudgetSpent(old.budgetId, -totalPaid);
    await Payment.deleteMany({ invoiceId: req.params.id });

    await Invoice.deleteOne({ _id: oid });

    await Transaction.deleteMany({ sourceId: req.params.id, type: 'INVOICE' });

    await audit({ user: req.user, module: 'Invoice', action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
