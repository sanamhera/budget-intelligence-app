/**
 * routes/approvals.js  — FY 2026-27
 * Changes vs original:
 *  + PATCH  /:id  — edit title/description/amount/nfaRaised/nfaApproved/linkedProjectId/pdfUrl
 *  + DELETE /:id  — delete with audit log entry
 *  + POST   /:id/upload — save uploaded PDF URL to approval record
 *  + POST   create — accepts linkedProjectId, nfaRaised (already-raised flow)
 *  + All writes fire an audit log entry to /audit collection
 */
const express  = require('express');
const multer   = require('multer');
const { body, validationResult } = require('express-validator');
const { db }   = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const STATUSES = ['Draft', 'Submitted', 'Pending', 'Approved', 'Rejected'];

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

/* ── GET all ─────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const status = req.query.status;
    let q = db.collection('approvals').orderBy('createdAt', 'desc');
    if (status) q = q.where('status', '==', status);
    const snap = await q.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST create ─────────────────────────────────────────────── */
router.post('/', requireRole('Admin', 'Requestor'), [
  body('title').notEmpty(),
  body('description').optional(),
  body('amount').optional().isFloat({ min: 0 }),
  body('linkedProjectId').optional(),
  body('nfaRaised').optional().isBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const alreadyRaised = req.body.nfaRaised === true || req.body.nfaRaised === 'true';

    const nfa = {
      title:           req.body.title,
      description:     req.body.description     || '',
      invoiceId:       req.body.invoiceId        || '',
      amount:          req.body.amount ? Number(req.body.amount) : 0,
      linkedProjectId: req.body.linkedProjectId  || '',
      // NFA workflow fields
      nfaRaised:       alreadyRaised,
      nfaApproved:     false,
      approvedAmount:  null,
      pdfUrl:          null,
      pdfName:         null,
      status:          alreadyRaised ? 'Submitted' : 'Draft',
      stage:           alreadyRaised ? 1 : 0,
      comments:        [],
      createdAt:       new Date(),
      createdBy:       req.user.uid,
      createdByName:   req.user.name || req.user.email,
    };

    const ref = await db.collection('approvals').add(nfa);
    await audit({ user: req.user, module: 'NFA', action: 'Create', recordId: ref.id, newValue: nfa });
    res.status(201).json({ id: ref.id, ...nfa });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET single ──────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('approvals').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── PATCH update ────────────────────────────────────────────── */
router.patch('/:id', requireRole('Admin', 'Requestor', 'Approver', 'Finance'), [
  body('title').optional().notEmpty(),
  body('amount').optional().isFloat({ min: 0 }),
  body('nfaRaised').optional(),
  body('nfaApproved').optional(),
  body('approvedAmount').optional().isFloat({ min: 0 }),
  body('linkedProjectId').optional(),
  body('pdfUrl').optional(),
  body('pdfName').optional(),
], async (req, res) => {
  try {
    const ref = db.collection('approvals').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    const old     = { id: doc.id, ...doc.data() };
    const updates = { updatedAt: new Date() };
    const allowed = [
      'title', 'description', 'amount', 'linkedProjectId',
      'nfaRaised', 'nfaApproved', 'approvedAmount',
      'pdfUrl', 'pdfName', 'status',
    ];
    allowed.forEach(k => { if (req.body[k] != null) updates[k] = req.body[k]; });

    // Boolean coercion for checkbox fields
    if (updates.nfaRaised  != null) updates.nfaRaised  = updates.nfaRaised  === true || updates.nfaRaised  === 'true';
    if (updates.nfaApproved!= null) updates.nfaApproved= updates.nfaApproved === true || updates.nfaApproved === 'true';
    if (updates.amount      != null) updates.amount     = Number(updates.amount);
    if (updates.approvedAmount != null) updates.approvedAmount = Number(updates.approvedAmount);

    // Auto-update status when nfaRaised / nfaApproved change
    const current = doc.data();
    if (updates.nfaRaised === false) {
      updates.nfaApproved    = false;
      updates.approvedAmount = null;
      updates.pdfUrl         = updates.pdfUrl  !== undefined ? updates.pdfUrl  : null;
      updates.status         = 'Draft';
    }
    if (updates.nfaRaised === true && !current.nfaRaised) {
      updates.status = updates.status || 'Submitted';
    }
    if (updates.nfaApproved === true) {
      updates.status = 'Approved';
    }

    await ref.update(updates);
    await audit({ user: req.user, module: 'NFA', action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── DELETE ──────────────────────────────────────────────────── */
router.delete('/:id', requireRole('Admin', 'Requestor'), async (req, res) => {
  try {
    const ref = db.collection('approvals').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const old = { id: doc.id, ...doc.data() };
    await ref.delete();
    await audit({ user: req.user, module: 'NFA', action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST submit ─────────────────────────────────────────────── */
router.post('/:id/submit', requireRole('Admin', 'Requestor'), async (req, res) => {
  try {
    const ref = db.collection('approvals').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    if (doc.data().status !== 'Draft') return res.status(400).json({ error: 'Already submitted' });
    await ref.update({ status: 'Submitted', stage: 1, submittedAt: new Date() });
    await audit({ user: req.user, module: 'NFA', action: 'Submit for Approval', recordId: req.params.id });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST approve / reject ───────────────────────────────────── */
router.post('/:id/approve', requireRole('Admin', 'Approver'), [
  body('comment').optional(),
  body('reject').optional().isBoolean(),
], async (req, res) => {
  try {
    const ref = db.collection('approvals').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const d = doc.data();
    if (d.status === 'Approved' || d.status === 'Rejected')
      return res.status(400).json({ error: 'Already decided' });

    const comment = {
      text:     req.body.comment || (req.body.reject ? 'Rejected' : 'Approved'),
      by:       req.user.name || req.user.email,
      at:       new Date(),
      approved: !req.body.reject,
    };
    const comments  = [...(d.comments || []), comment];
    const newStatus = req.body.reject ? 'Rejected' : (d.stage >= 2 ? 'Approved' : 'Pending');
    const newStage  = req.body.reject ? d.stage : d.stage + 1;

    await ref.update({ status: newStatus, stage: newStage, comments, updatedAt: new Date() });
    await audit({ user: req.user, module: 'NFA', action: req.body.reject ? 'Rejected' : 'Approved', recordId: req.params.id });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST upload PDF ─────────────────────────────────────────── */
router.post('/upload', requireRole('Admin', 'Requestor', 'Finance'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });
    const approvalId = req.body.approvalId;

    // Store in Firestore as base64 data URL (or swap for Cloud Storage if available)
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
    const fileName = req.file.originalname;

    if (approvalId) {
      const ref = db.collection('approvals').doc(approvalId);
      const doc = await ref.get();
      if (doc.exists) {
        await ref.update({ pdfUrl: dataUrl, pdfName: fileName, updatedAt: new Date() });
        await audit({ user: req.user, module: 'NFA', action: 'File Upload', recordId: approvalId, newValue: { pdfName: fileName } });
      }
    }

    res.json({ url: dataUrl, fileUrl: dataUrl, name: fileName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;