/**
 * routes/payment.js  — MongoDB
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { Budget, Invoice, Payment, AuditLog, Vendor } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient, parseObjectId } = require('../utils/toClient');

const router = express.Router();
router.use(auth);

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
  const spent = Math.max(0, (doc.spent || 0) + delta);
  const alloc = doc.allocated || 0;
  doc.spent = spent;
  doc.remaining = alloc - spent;
  doc.status = spent > alloc ? 'Overrun' : 'Active';
  doc.updatedAt = new Date();
  await doc.save();
}

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.invoiceId) filter.invoiceId = req.query.invoiceId;
    const rows = await Payment.find(filter).sort({ createdAt: -1 }).lean();
    res.json(rows.map(toClient));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const doc = await Payment.findById(oid).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(toClient(doc));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireRole('Admin', 'Finance'), [
  body('invoiceId').notEmpty(),
  body('amount').isFloat({ min: 0.01 }),
  body('note').optional(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const invOid = parseObjectId(req.body.invoiceId);
    if (!invOid) return res.status(404).json({ error: 'Invoice not found' });
    const invDoc = await Invoice.findById(invOid);
    if (!invDoc) return res.status(404).json({ error: 'Invoice not found' });

    const inv = invDoc.toObject();
    const amount = Number(req.body.amount);
    const paid = inv.paidAmount || 0;

    if (paid + amount > inv.amount + (inv.tax || 0)) {
      return res.status(400).json({ error: 'Payment exceeds invoice total' });
    }

    let vendorName = inv.vendorName || '';
    if (inv.vendorId) {
      try {
        const vOid = parseObjectId(inv.vendorId);
        if (vOid) {
          const venDoc = await Vendor.findById(vOid).lean();
          if (venDoc) vendorName = venDoc.name || vendorName;
        }
      } catch { /* use invoice vendorName */ }
    }

    const payment = {
      invoiceId: req.body.invoiceId,
      budgetId: inv.budgetId,
      vendorId: inv.vendorId || null,
      vendorName,
      invoiceNumber: inv.invoiceNumber || req.body.invoiceId,
      amount,
      note: req.body.note || '',
      createdAt: new Date(),
      createdBy: req.user.uid,
    };

    const payDoc = await Payment.create(payment);
    const newPaid = paid + amount;

    invDoc.paidAmount = newPaid;
    invDoc.status = newPaid >= inv.amount + (inv.tax || 0) ? 'Paid' : 'Partial';
    invDoc.updatedAt = new Date();
    await invDoc.save();

    await adjustBudgetSpent(inv.budgetId, amount);
    await audit({ user: req.user, module: 'Payment', action: 'Create', recordId: String(payDoc._id), newValue: payment });
    res.status(201).json(toClient(payDoc));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireRole('Admin', 'Finance'), [
  body('amount').optional().isFloat({ min: 0.01 }),
  body('note').optional(),
], async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const doc = await Payment.findById(oid);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const old = toClient(doc);
    if (req.body.note != null) doc.note = req.body.note;
    if (req.body.amount != null) doc.amount = Number(req.body.amount);
    doc.updatedAt = new Date();

    const delta = doc.amount - old.amount;

    if (delta !== 0) {
      const invOid = parseObjectId(old.invoiceId);
      if (invOid) {
        const invDoc = await Invoice.findById(invOid);
        if (invDoc) {
          const inv = invDoc.toObject();
          const newPaid = (inv.paidAmount || 0) + delta;
          const invTotal = (inv.amount || 0) + (inv.tax || 0);
          if (newPaid > invTotal) {
            return res.status(400).json({ error: 'Payment would exceed invoice total' });
          }
          invDoc.paidAmount = newPaid;
          invDoc.status = newPaid >= invTotal ? 'Paid' : 'Partial';
          invDoc.updatedAt = new Date();
          await invDoc.save();
        }
      }
      await adjustBudgetSpent(old.budgetId, delta);
    }

    await doc.save();
    await audit({ user: req.user, module: 'Payment', action: 'Edit', recordId: req.params.id, oldValue: old, newValue: toClient(doc) });
    res.json(toClient(doc));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const doc = await Payment.findById(oid);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const old = toClient(doc);

    const invOid = parseObjectId(old.invoiceId);
    if (invOid) {
      const invDoc = await Invoice.findById(invOid);
      if (invDoc) {
        const inv = invDoc.toObject();
        const newPaid = Math.max(0, (inv.paidAmount || 0) - old.amount);
        invDoc.paidAmount = newPaid;
        invDoc.status = newPaid <= 0 ? 'Pending' : 'Partial';
        invDoc.updatedAt = new Date();
        await invDoc.save();
      }
    }
    await adjustBudgetSpent(old.budgetId, -old.amount);

    await Payment.deleteOne({ _id: oid });
    await audit({ user: req.user, module: 'Payment', action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
