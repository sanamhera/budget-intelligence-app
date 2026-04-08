/**
 * routes/vendors.js  — FY 2026-27
 *
 * Vendor Master — central source of truth.
 * Sequential IDs: VEN00001, VEN00002, …
 *
 * Routes:
 *   GET    /api/vendors            — list all
 *   POST   /api/vendors            — create manually
 *   POST   /api/vendors/auto-create — auto-create from invoice upload (internal)
 *   GET    /api/vendors/:id        — single vendor
 *   PATCH  /api/vendors/:id        — update
 *   DELETE /api/vendors/:id        — delete
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { db }   = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

/* ── audit helper ───────────────────────────────────────────── */
async function audit({ user, action, recordId, oldValue, newValue }) {
  try {
    await db.collection('audit').add({
      user:      user?.name || user?.email || 'System',
      module:    'Vendor',
      action,
      recordId:  recordId || null,
      oldValue:  oldValue  != null ? JSON.stringify(oldValue)  : null,
      newValue:  newValue  != null ? JSON.stringify(newValue)  : null,
      timestamp: new Date(),
    });
  } catch { /* never break main flow */ }
}

/* ── generate next sequential VEN00001 ID ───────────────────── */
async function nextVendorCode() {
  // Use a Firestore counter document for race-safe sequential IDs
  const counterRef = db.collection('_counters').doc('vendors');
  let next = 1;
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    next = doc.exists ? (doc.data().count || 0) + 1 : 1;
    tx.set(counterRef, { count: next }, { merge: true });
  });
  return `VEN${String(next).padStart(5, '0')}`;
}

/* ── deduplicate by name (case-insensitive) ─────────────────── */
async function findByName(name) {
  const snap = await db.collection('vendors')
    .where('nameLower', '==', name.trim().toLowerCase()).limit(1).get();
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  return null;
}

/* ── GET all ─────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const snap = await db.collection('vendors').orderBy('createdAt', 'desc').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET single ──────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('vendors').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /auto-create — called from invoice upload flow ────── */
// If vendor exists by name → return existing. Otherwise create new.
// All roles can trigger this (it's system-initiated from invoice confirm).
router.post('/auto-create', async (req, res) => {
  try {
    const { name, gstNumber, address, contactPerson, email, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Vendor name required' });

    // Return existing vendor if name matches
    const existing = await findByName(name);
    if (existing) return res.json({ ...existing, autoCreated: false });

    const code = await nextVendorCode();
    const data  = {
      name:          name.trim(),
      nameLower:     name.trim().toLowerCase(),
      vendorCode:    code,
      gstNumber:     gstNumber     || '',
      address:       address       || '',
      contactPerson: contactPerson || '',
      email:         email         || '',
      phone:         phone         || '',
      category:      '',
      contractType:  '',
      createdAt:     new Date(),
      createdBy:     req.user?.uid || 'system',
      source:        'auto-invoice',
    };

    const ref = await db.collection('vendors').add(data);
    await audit({ user: req.user, action: 'Auto-Create', recordId: ref.id, newValue: data });
    res.status(201).json({ id: ref.id, ...data, autoCreated: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST create (manual) ────────────────────────────────────── */
router.post('/', requireRole('Admin', 'Finance'), [
  body('name').notEmpty().withMessage('Vendor name is required'),
  body('email').optional({ checkFalsy: true }).isEmail(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, vendorCode, category, contractType, contactPerson, email, phone, gstNumber, address } = req.body;

    // Duplicate name check
    const dup = await findByName(name);
    if (dup) return res.status(409).json({
      error: `A vendor named "${dup.name}" already exists (${dup.vendorCode})`,
      existing: dup,
    });

    // Use provided code or generate sequential one
    let code = (vendorCode || '').trim();
    if (code) {
      // Check code uniqueness
      const codeDup = await db.collection('vendors').where('vendorCode', '==', code).limit(1).get();
      if (!codeDup.empty) return res.status(409).json({ error: `Vendor code "${code}" already in use` });
    } else {
      code = await nextVendorCode();
    }

    const data = {
      name:          name.trim(),
      nameLower:     name.trim().toLowerCase(),
      vendorCode:    code,
      category:      category      || '',
      contractType:  contractType  || '',
      contactPerson: contactPerson || '',
      email:         email         || '',
      phone:         phone         || '',
      gstNumber:     gstNumber     || '',
      address:       address       || '',
      createdAt:     new Date(),
      createdBy:     req.user.uid,
      source:        'manual',
    };

    const ref = await db.collection('vendors').add(data);
    await audit({ user: req.user, action: 'Create', recordId: ref.id, newValue: data });
    res.status(201).json({ id: ref.id, ...data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PATCH update ────────────────────────────────────────────── */
router.patch('/:id', requireRole('Admin', 'Finance'), [
  body('name').optional().notEmpty(),
  body('email').optional({ checkFalsy: true }).isEmail(),
], async (req, res) => {
  try {
    const ref = db.collection('vendors').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Vendor not found' });

    const old     = { id: doc.id, ...doc.data() };
    const updates = { updatedAt: new Date() };

    const FIELDS = ['name','vendorCode','category','contractType','contactPerson','email','phone','gstNumber','address'];
    FIELDS.forEach(k => { if (req.body[k] != null) updates[k] = req.body[k]; });
    if (updates.name) updates.nameLower = updates.name.trim().toLowerCase();

    await ref.update(updates);
    await audit({ user: req.user, action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── DELETE ──────────────────────────────────────────────────── */
router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const ref = db.collection('vendors').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Vendor not found' });
    const old = { id: doc.id, ...doc.data() };

    const linked = await db.collection('invoices').where('vendorId', '==', req.params.id).limit(1).get();
    if (!linked.empty) {
      return res.status(409).json({
        error: 'Cannot delete vendor with linked invoices. Remove or reassign invoices first.',
        linkedInvoices: true,
      });
    }

    await ref.delete();
    await audit({ user: req.user, action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;