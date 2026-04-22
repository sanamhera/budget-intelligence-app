/**
 * routes/po.js
 * Mounted at: /api/pos
 * Firestore collection: pos
 * Logic delegated to transactionService
 */

const express = require('express');
const multer  = require('multer');
const { body, validationResult } = require('express-validator');
const { db }  = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');
const { createPO, addInvoiceToPO, writeAudit } = require('../services/transactionService');

const router  = express.Router();
router.use(auth);
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const PO_STATUSES = ['Draft','Issued','Partially Invoiced','Fully Invoiced','Closed','Cancelled'];

/* GET /api/pos?entityId= */
router.get('/', async (req, res) => {
  try {
    let q = db.collection('pos').orderBy('createdAt', 'desc');
    if (req.query.entityId) q = q.where('entityId', '==', req.query.entityId);
    if (req.query.status)   q = q.where('status',   '==', req.query.status);
    const snap = await q.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/pos/:id */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('pos').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'PO not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/pos */
router.post('/', requireRole('Admin','Finance','Requestor'), [
  body('entityId').notEmpty(),
  body('vendorName').notEmpty(),
  body('amount').isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const po = await createPO({ ...req.body, user: req.user });
    res.status(201).json(po);
  } catch (e) {
    const status = e.message.includes('NFA') ? 422 : 500;
    res.status(status).json({ error: e.message });
  }
});

/* PATCH /api/pos/:id */
router.patch('/:id', requireRole('Admin','Finance'), async (req, res) => {
  try {
    const ref = db.collection('pos').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'PO not found' });

    const old     = { id: doc.id, ...doc.data() };
    const updates = { updatedAt: new Date() };
    ['vendorName','poNumber','description','status'].forEach(k => { if (req.body[k] != null) updates[k] = req.body[k]; });
    if (req.body.amount != null) updates.amount = Number(req.body.amount);

    await ref.update(updates);
    await writeAudit({ user: req.user, module: 'PO', action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* DELETE /api/pos/:id */
router.delete('/:id', requireRole('Admin','Finance'), async (req, res) => {
  try {
    const ref = db.collection('pos').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'PO not found' });
    const old = { id: doc.id, ...doc.data() };
    await ref.delete();
    await writeAudit({ user: req.user, module: 'PO', action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/pos/upload */
router.post('/upload', requireRole('Admin','Finance','Requestor'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });
    const poId    = req.body.poId;
    const base64  = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
    const fileName = req.file.originalname;

    if (poId) {
      const ref = db.collection('pos').doc(poId);
      const doc = await ref.get();
      if (doc.exists) {
        await ref.update({ pdfUrl: dataUrl, pdfName: fileName, updatedAt: new Date() });
        await writeAudit({ user: req.user, module: 'PO', action: 'File Upload', recordId: poId, newValue: { pdfName: fileName } });
      }
    }
    res.json({ url: dataUrl, fileUrl: dataUrl, name: fileName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/pos/:id/invoices */
router.post('/:id/invoices', requireRole('Admin','Finance','Requestor'), [
  body('vendorName').notEmpty(),
  body('amount').isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const updated = await addInvoiceToPO(req.params.id, req.body, req.user);
    res.status(201).json(updated);
  } catch (e) {
    res.status(e.message === 'PO not found' ? 404 : 500).json({ error: e.message });
  }
});

/* DELETE /api/pos/:id/invoices/:iid */
router.delete('/:id/invoices/:iid', requireRole('Admin','Finance'), async (req, res) => {
  try {
    const ref = db.collection('pos').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'PO not found' });
    const updated = (doc.data().invoices || []).filter(inv => inv.id !== req.params.iid);
    await ref.update({ invoices: updated });
    await writeAudit({ user: req.user, module: 'PO', action: 'Remove Invoice', recordId: req.params.id, newValue: { removedId: req.params.iid } });
    const fresh = await ref.get();
    res.json({ id: fresh.id, ...fresh.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;