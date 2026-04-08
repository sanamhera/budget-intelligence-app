/**
 * routes/invoices.js  — FY 2026-27
 * Changes vs original:
 *  + PATCH  /:id  — edit vendorName/invoiceNumber/amount/tax/date/dueDate/glCode/budgetId
 *                   correctly reverses old amount from budget.spent and applies new amount
 *  + DELETE /:id  — reverses budget.spent, fires audit
 *  + All writes fire audit log entries
 *  All existing routes (GET, POST /, POST /upload, POST /confirm, GET /:id) unchanged
 */
const express  = require('express');
const multer   = require('multer');
const { body, validationResult } = require('express-validator');
const { db }   = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');
const { parseInvoicePDF } = require('../services/gemini');
const { getVendorGL, saveVendorGL } = require('../utils/vendorGL');

const router = express.Router();
router.use(auth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/* ── audit helper ───────────────────────────────────────────── */
async function audit({ user, module: mod, action, recordId, oldValue, newValue }) {
  try {
    await db.collection('audit').add({
      user:      user?.name || user?.email || 'Unknown',
      module:    mod,
      action,
      recordId:  recordId || null,
      oldValue:  oldValue  != null ? JSON.stringify(oldValue)  : null,
      newValue:  newValue  != null ? JSON.stringify(newValue)  : null,
      timestamp: new Date(),
    });
  } catch { /* never break main flow */ }
}

/* ── budget spent delta helper ──────────────────────────────── */
async function adjustBudgetSpent(budgetId, delta) {
  if (!budgetId || delta === 0) return;
  const ref = db.collection('budgets').doc(budgetId);
  const doc = await ref.get();
  if (!doc.exists) return;
  const d         = doc.data();
  const spent     = Math.max(0, (d.spent || 0) + delta);
  const allocated = d.allocated || 0;
  await ref.update({
    spent,
    remaining: allocated - spent,
    status:    spent > allocated ? 'Overrun' : 'Active',
    updatedAt: new Date(),
  });
}

/* ── GET all ─────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const budgetId = req.query.budgetId;
    let q = db.collection('invoices').orderBy('createdAt', 'desc');
    if (budgetId) q = q.where('budgetId', '==', budgetId);
    const snap = await q.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET single ──────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('invoices').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST upload (unchanged) ─────────────────────────────────── */
router.post('/upload', requireRole('Admin', 'Requestor', 'Finance'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file || req.file.mimetype !== 'application/pdf')
      return res.status(400).json({ error: 'PDF file required' });
    const { budgetId } = req.body;
    if (!budgetId) return res.status(400).json({ error: 'budgetId required' });
    const budgetSnap = await db.collection('budgets').doc(budgetId).get();
    if (!budgetSnap.exists) return res.status(404).json({ error: 'Budget not found' });

    const glSnap = await db.collection('glCodes').where('active', '==', true).get();
    const glList = glSnap.docs.map(d => ({ code: d.data().code, name: d.data().name }));

    const extracted = await parseInvoicePDF(req.file.buffer, glList);
    const vendorGL  = await getVendorGL(extracted.vendorName);
    if (vendorGL && extracted.lineItems?.length) extracted.lineItems[0].glCode = vendorGL;

    res.json({
      preview: {
        budgetId,
        fileName:      req.file.originalname,
        vendorName:    extracted.vendorName,
        invoiceNumber: extracted.invoiceNumber,
        amount:        extracted.amount,
        tax:           extracted.tax,
        date:          extracted.date || new Date().toISOString().slice(0, 10),
        dueDate:       extracted.dueDate || '',
        lineItems:     extracted.lineItems || [],
      },
    });
  } catch (e) {
    console.error('UPLOAD ERROR:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ── POST confirm (unchanged) ────────────────────────────────── */
router.post('/confirm', requireRole('Admin', 'Requestor', 'Finance'), async (req, res) => {
  try {
    const invoice     = req.body;
    const totalAmount = Number(invoice.amount || 0) + Number(invoice.tax || 0);

    const ref = await db.collection('invoices').add({
      ...invoice,
      lineItems:  invoice.lineItems || [],
      amount:     Number(invoice.amount),
      tax:        Number(invoice.tax) || 0,
      status:     'Pending',
      paidAmount: 0,
      createdAt:  new Date(),
      createdBy:  req.user.uid,
    });

    const firstGL = invoice.lineItems?.[0]?.glCode;
    if (firstGL) await saveVendorGL(invoice.vendorName, firstGL);

    // Update budget
    const budgetRef  = db.collection('budgets').doc(invoice.budgetId);
    const budgetSnap = await budgetRef.get();
    if (budgetSnap.exists) {
      const b = budgetSnap.data();
      const newSpent = (b.spent || 0) + totalAmount;
      await budgetRef.update({
        spent:     newSpent,
        remaining: (b.allocated || 0) - newSpent,
        status:    newSpent > (b.allocated || 0) ? 'Overrun' : 'Active',
      });
    }

    await audit({ user: req.user, module: 'Invoice', action: 'Create via Upload', recordId: ref.id, newValue: { vendorName: invoice.vendorName, amount: invoice.amount } });
    res.status(201).json({ success: true, id: ref.id });
  } catch (e) {
    console.error('CONFIRM ERROR:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ── POST manual create (unchanged) ─────────────────────────── */
router.post('/', requireRole('Admin', 'Requestor', 'Finance'), [
  body('budgetId').notEmpty(),
  body('vendorName').notEmpty(),
  body('amount').isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const budgetSnap = await db.collection('budgets').doc(req.body.budgetId).get();
    if (!budgetSnap.exists) return res.status(404).json({ error: 'Budget not found' });

    const invoice = {
      ...req.body,
      amount:     Number(req.body.amount),
      tax:        Number(req.body.tax) || 0,
      status:     'Pending',
      paidAmount: 0,
      createdAt:  new Date(),
      createdBy:  req.user.uid,
    };

    const ref = await db.collection('invoices').add(invoice);
    await audit({ user: req.user, module: 'Invoice', action: 'Create', recordId: ref.id, newValue: invoice });
    res.status(201).json({ id: ref.id, ...invoice });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── PATCH update ────────────────────────────────────────────── */
router.patch('/:id', requireRole('Admin', 'Finance'), [
  body('vendorName').optional().notEmpty(),
  body('amount').optional().isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const ref = db.collection('invoices').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    const old     = { id: doc.id, ...doc.data() };
    const updates = { updatedAt: new Date() };
    const editableFields = ['vendorName','invoiceNumber','date','dueDate','glCode','budgetId','status'];
    editableFields.forEach(k => { if (req.body[k] != null) updates[k] = req.body[k]; });
    if (req.body.amount != null) updates.amount = Number(req.body.amount);
    if (req.body.tax    != null) updates.tax    = Number(req.body.tax);

    // If amount or tax changed, adjust budget.spent
    const oldTotal = (old.amount || 0) + (old.tax || 0);
    const newTotal = (updates.amount ?? old.amount ?? 0) + (updates.tax ?? old.tax ?? 0);
    const delta    = newTotal - oldTotal;

    // If budgetId changed, reverse old budget and charge new budget
    if (updates.budgetId && updates.budgetId !== old.budgetId) {
      await adjustBudgetSpent(old.budgetId, -oldTotal);
      await adjustBudgetSpent(updates.budgetId, newTotal);
    } else if (delta !== 0) {
      await adjustBudgetSpent(old.budgetId, delta);
    }

    await ref.update(updates);
    await audit({ user: req.user, module: 'Invoice', action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── DELETE ──────────────────────────────────────────────────── */
router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const ref = db.collection('invoices').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const old = { id: doc.id, ...doc.data() };

    // Only reverse spent for Pending/Partial invoices (Paid already settled)
    if (old.status !== 'Paid') {
      const unspent = (old.amount || 0) + (old.tax || 0) - (old.paidAmount || 0);
      await adjustBudgetSpent(old.budgetId, -unspent);
    }

    await ref.delete();
    await audit({ user: req.user, module: 'Invoice', action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;