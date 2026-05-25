/**
 * routes/vendors.js  — MongoDB
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { Vendor, Invoice, AuditLog, Counter } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient, parseObjectId } = require('../utils/toClient');

const router = express.Router();
router.use(auth);

async function audit({ user, action, recordId, oldValue, newValue }) {
  try {
    await AuditLog.create({
      user: user?.name || user?.email || 'System',
      module: 'Vendor',
      action,
      recordId: recordId || null,
      oldValue: oldValue != null ? JSON.stringify(oldValue) : null,
      newValue: newValue != null ? JSON.stringify(newValue) : null,
      timestamp: new Date(),
    });
  } catch {}
}

async function nextVendorCode() {
  const doc = await Counter.findOneAndUpdate(
    { _id: 'vendors' },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );
  const n = doc?.count || 1;
  return `VEN${String(n).padStart(5, '0')}`;
}

async function findByName(name) {
  const row = await Vendor.findOne({ nameLower: name.trim().toLowerCase() }).lean();
  return row ? toClient(row) : null;
}

router.get('/', async (req, res) => {
  try {
    const rows = await Vendor.find().sort({ createdAt: -1 }).lean();
    res.json(rows.map(toClient));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Vendor not found' });
    const doc = await Vendor.findById(oid).lean();
    if (!doc) return res.status(404).json({ error: 'Vendor not found' });
    res.json(toClient(doc));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/auto-create', async (req, res) => {
  try {
    const { name, gstNumber, address, contactPerson, email, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Vendor name required' });

    const existing = await findByName(name);
    if (existing) return res.json({ ...existing, autoCreated: false });

    const code = await nextVendorCode();
    const data = {
      name: name.trim(),
      nameLower: name.trim().toLowerCase(),
      vendorCode: code,
      gstNumber: gstNumber || '',
      address: address || '',
      contactPerson: contactPerson || '',
      email: email || '',
      phone: phone || '',
      category: '',
      contractType: '',
      services: [],
      createdAt: new Date(),
      createdBy: req.user?.uid || 'system',
      source: 'auto-invoice',
    };

    const ref = await Vendor.create(data);
    await audit({ user: req.user, action: 'Auto-Create', recordId: String(ref._id), newValue: data });
    res.status(201).json({ id: String(ref._id), ...data, autoCreated: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('Admin', 'Finance'), [
  body('name').notEmpty().withMessage('Vendor name is required'),
  body('email').optional({ checkFalsy: true }).isEmail(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, vendorCode, category, contractType, contactPerson, email, phone, gstNumber, address } = req.body;

    const dup = await findByName(name);
    if (dup) {
      return res.status(409).json({
        error: `A vendor named "${dup.name}" already exists (${dup.vendorCode})`,
        existing: dup,
      });
    }

    let code = (vendorCode || '').trim();
    if (code) {
      const codeDup = await Vendor.findOne({ vendorCode: code }).lean();
      if (codeDup) return res.status(409).json({ error: `Vendor code "${code}" already in use` });
    } else {
      code = await nextVendorCode();
    }

    const data = {
      name: name.trim(),
      nameLower: name.trim().toLowerCase(),
      vendorCode: code,
      category: category || '',
      contractType: contractType || '',
      contactPerson: contactPerson || '',
      email: email || '',
      phone: phone || '',
      gstNumber: gstNumber || '',
      address: address || '',
      services: Array.isArray(req.body.services) ? req.body.services : [],
      createdAt: new Date(),
      createdBy: req.user.uid,
      source: 'manual',
    };

    const ref = await Vendor.create(data);
    await audit({ user: req.user, action: 'Create', recordId: String(ref._id), newValue: data });
    res.status(201).json({ id: String(ref._id), ...data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', requireRole('Admin', 'Finance'), [
  body('name').optional().notEmpty(),
  body('email').optional({ checkFalsy: true }).isEmail(),
], async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Vendor not found' });
    const doc = await Vendor.findById(oid);
    if (!doc) return res.status(404).json({ error: 'Vendor not found' });

    const old = toClient(doc.toObject());
    const updates = { updatedAt: new Date() };
    const FIELDS = ['name', 'vendorCode', 'category', 'contractType', 'contactPerson', 'email', 'phone', 'gstNumber', 'address'];
    FIELDS.forEach(k => { if (req.body[k] != null) updates[k] = req.body[k]; });
    if (req.body.services != null) updates.services = Array.isArray(req.body.services) ? req.body.services : [];
    if (updates.name) updates.nameLower = updates.name.trim().toLowerCase();
    Object.assign(doc, updates);
    await doc.save();
    await audit({ user: req.user, action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    res.json(toClient(doc));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Vendor not found' });
    const doc = await Vendor.findById(oid);
    if (!doc) return res.status(404).json({ error: 'Vendor not found' });
    const old = toClient(doc.toObject());

    const linked = await Invoice.findOne({ vendorId: req.params.id }).lean();
    if (linked) {
      return res.status(409).json({
        error: 'Cannot delete vendor with linked invoices. Remove or reassign invoices first.',
        linkedInvoices: true,
      });
    }

    await Vendor.deleteOne({ _id: oid });
    await audit({ user: req.user, action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
