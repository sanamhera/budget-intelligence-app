/**
 * routes/payments.js  — FY 2026-27
 * Changes vs original:
 *  + PATCH  /:id  — edit amount/note; correctly reverses old budget delta and applies new
 *  + DELETE /:id  — reverses budget.spent and invoice.paidAmount, fires audit
 *  + All writes fire audit log entries
 *  All existing routes (GET, POST /, GET /:id) unchanged
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { db }  = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

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
  const d     = doc.data();
  const spent = Math.max(0, (d.spent || 0) + delta);
  const alloc = d.allocated || 0;
  await ref.update({ spent, remaining: alloc - spent, status: spent > alloc ? 'Overrun' : 'Active', updatedAt: new Date() });
}

/* ── GET all ─────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const invoiceId = req.query.invoiceId;
    let q = db.collection('payments').orderBy('createdAt', 'desc');
    if (invoiceId) q = q.where('invoiceId', '==', invoiceId);
    const snap = await q.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET single ──────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('payments').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST create — denormalises vendorId/vendorName/invoiceNumber ── */
router.post('/', requireRole('Admin', 'Finance'), [
  body('invoiceId').notEmpty(),
  body('amount').isFloat({ min: 0.01 }),
  body('note').optional(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const invRef = db.collection('invoices').doc(req.body.invoiceId);
    const invDoc = await invRef.get();
    if (!invDoc.exists) return res.status(404).json({ error: 'Invoice not found' });

    const inv    = invDoc.data();
    const amount = Number(req.body.amount);
    const paid   = inv.paidAmount || 0;

    if (paid + amount > inv.amount + (inv.tax || 0))
      return res.status(400).json({ error: 'Payment exceeds invoice total' });

    // Denormalise vendor info from invoice so payments table never needs joins
    let vendorName = inv.vendorName || '';
    if (inv.vendorId) {
      try {
        const venDoc = await db.collection('vendors').doc(inv.vendorId).get();
        if (venDoc.exists) vendorName = venDoc.data().name || vendorName;
      } catch { /* use invoice vendorName fallback */ }
    }

    const payment = {
      invoiceId:     req.body.invoiceId,
      budgetId:      inv.budgetId,
      vendorId:      inv.vendorId      || null,
      vendorName:    vendorName,
      invoiceNumber: inv.invoiceNumber || req.body.invoiceId,
      amount,
      note:          req.body.note || '',
      createdAt:     new Date(),
      createdBy:     req.user.uid,
    };

    const payRef  = await db.collection('payments').add(payment);
    const newPaid = paid + amount;

    await invRef.update({
      paidAmount: newPaid,
      status:     newPaid >= inv.amount + (inv.tax || 0) ? 'Paid' : 'Partial',
      updatedAt:  new Date(),
    });
    await adjustBudgetSpent(inv.budgetId, amount);
    await audit({ user: req.user, module: 'Payment', action: 'Create', recordId: payRef.id, newValue: payment });
    res.status(201).json({ id: payRef.id, ...payment });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── PATCH update ────────────────────────────────────────────── */
router.patch('/:id', requireRole('Admin', 'Finance'), [
  body('amount').optional().isFloat({ min: 0.01 }),
  body('note').optional(),
], async (req, res) => {
  try {
    const ref = db.collection('payments').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    const old     = { id: doc.id, ...doc.data() };
    const updates = { updatedAt: new Date() };
    if (req.body.note   != null) updates.note   = req.body.note;
    if (req.body.amount != null) updates.amount = Number(req.body.amount);

    const delta = (updates.amount || old.amount) - old.amount;

    if (delta !== 0) {
      // Validate against invoice total
      const invDoc = await db.collection('invoices').doc(old.invoiceId).get();
      if (invDoc.exists) {
        const inv      = invDoc.data();
        const newPaid  = (inv.paidAmount || 0) + delta;
        const invTotal = (inv.amount || 0) + (inv.tax || 0);
        if (newPaid > invTotal)
          return res.status(400).json({ error: 'Payment would exceed invoice total' });

        await db.collection('invoices').doc(old.invoiceId).update({
          paidAmount: newPaid,
          status:     newPaid >= invTotal ? 'Paid' : 'Partial',
          updatedAt:  new Date(),
        });
      }
      await adjustBudgetSpent(old.budgetId, delta);
    }

    await ref.update(updates);
    await audit({ user: req.user, module: 'Payment', action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── DELETE ──────────────────────────────────────────────────── */
router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const ref = db.collection('payments').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const old = { id: doc.id, ...doc.data() };

    // Reverse invoice paidAmount and budget spent
    const invRef = db.collection('invoices').doc(old.invoiceId);
    const invDoc = await invRef.get();
    if (invDoc.exists) {
      const inv     = invDoc.data();
      const newPaid = Math.max(0, (inv.paidAmount || 0) - old.amount);
      await invRef.update({
        paidAmount: newPaid,
        status:     newPaid <= 0 ? 'Pending' : 'Partial',
        updatedAt:  new Date(),
      });
    }
    await adjustBudgetSpent(old.budgetId, -old.amount);

    await ref.delete();
    await audit({ user: req.user, module: 'Payment', action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;