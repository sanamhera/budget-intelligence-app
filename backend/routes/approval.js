/**
 * routes/approval.js  — NFA Tracker
 * Mounted at: /api/nfa-tracker
 * Firestore collection: approvals
 *
 * NFA workflow: Draft → Submitted → Approved/Rejected
 * On approval, also creates a transaction record (type: NFA, status: Approved)
 * so the Budget tab can show NFA status without querying approvals.
 */

const express  = require('express');
const multer   = require('multer');
const { body, validationResult } = require('express-validator');
const { db }   = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');
const { createTransaction, updateTransaction, writeAudit } = require('../services/transactionService');

const router = express.Router();
router.use(auth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/* ── helper: sync linked transaction ────────────────────────── */
async function syncTransaction(sourceId, updates) {
  if (!sourceId || !updates) return;
  try {
    const snap = await db.collection('transactions')
      .where('sourceId', '==', sourceId).where('type', '==', 'NFA').limit(1).get();
    if (!snap.empty) await snap.docs[0].ref.update({ ...updates, updatedAt: new Date() });
  } catch {}
}

/* GET /api/nfa-tracker */
router.get('/', async (req, res) => {
  try {
    let q = db.collection('approvals').orderBy('createdAt', 'desc');
    if (req.query.status) q = q.where('status', '==', req.query.status);
    const snap = await q.get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/nfa-tracker/:id */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('approvals').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/nfa-tracker — create NFA */
router.post('/', requireRole('Admin','Requestor'), [
  body('title').notEmpty(),
  body('entityId').optional(),       // budget entity this NFA is for
  body('entityType').optional(),
  body('amount').optional().isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const alreadyRaised = req.body.nfaRaised === true || req.body.nfaRaised === 'true';

    const nfa = {
      title:           req.body.title,
      description:     req.body.description     || '',
      amount:          req.body.amount ? Number(req.body.amount) : 0,
      entityId:        req.body.entityId         || req.body.linkedProjectId || '',
      entityType:      req.body.entityType       || 'expense',
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

    // Mirror to transactions if linked to an entity
    if (nfa.entityId) {
      try {
        await createTransaction({
          type:        'NFA',
          entityId:    nfa.entityId,
          entityType:  nfa.entityType,
          amount:      nfa.amount,
          description: nfa.title,
          status:      nfa.status,
          sourceId:    ref.id,
          user:        req.user,
        });
      } catch { /* don't fail NFA creation if tx write fails */ }
    }

    await writeAudit({ user: req.user, module: 'NFA', action: 'Create', recordId: ref.id, newValue: nfa });
    res.status(201).json({ id: ref.id, ...nfa });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* PATCH /api/nfa-tracker/:id */
router.patch('/:id', requireRole('Admin','Requestor','Approver','Finance'), [
  body('title').optional().notEmpty(),
  body('amount').optional().isFloat({ min: 0 }),
  body('approvedAmount').optional().isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const ref = db.collection('approvals').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    const old     = { id: doc.id, ...doc.data() };
    const updates = { updatedAt: new Date() };
    ['title','description','amount','entityId','nfaRaised','nfaApproved','approvedAmount','pdfUrl','pdfName','status'].forEach(k => {
      if (req.body[k] != null) updates[k] = req.body[k];
    });

    if (updates.nfaRaised   != null) updates.nfaRaised   = updates.nfaRaised   === true || updates.nfaRaised   === 'true';
    if (updates.nfaApproved != null) updates.nfaApproved = updates.nfaApproved  === true || updates.nfaApproved === 'true';
    if (updates.amount          != null) updates.amount          = Number(updates.amount);
    if (updates.approvedAmount  != null) updates.approvedAmount  = Number(updates.approvedAmount);

    const current = doc.data();
    if (updates.nfaRaised === false) { updates.nfaApproved = false; updates.approvedAmount = null; updates.status = 'Draft'; }
    if (updates.nfaRaised === true && !current.nfaRaised) updates.status = updates.status || 'Submitted';
    if (updates.nfaApproved === true) updates.status = 'Approved';

    await ref.update(updates);

    // Sync to transaction
    const txSync = {};
    if (updates.status        != null) txSync.status  = updates.status;
    if (updates.amount        != null) txSync.amount  = updates.amount;
    if (updates.approvedAmount!= null) txSync.amount  = updates.approvedAmount;
    if (updates.pdfUrl        != null) txSync.fileUrl = updates.pdfUrl;
    if (updates.pdfName       != null) txSync.fileName= updates.pdfName;
    if (Object.keys(txSync).length) await syncTransaction(req.params.id, txSync);

    await writeAudit({ user: req.user, module: 'NFA', action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* DELETE /api/nfa-tracker/:id */
router.delete('/:id', requireRole('Admin','Requestor'), async (req, res) => {
  try {
    const ref = db.collection('approvals').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const old = { id: doc.id, ...doc.data() };
    await ref.delete();
    // Remove linked transaction
    try {
      const snap = await db.collection('transactions').where('sourceId','==',req.params.id).where('type','==','NFA').limit(1).get();
      if (!snap.empty) await snap.docs[0].ref.delete();
    } catch {}
    await writeAudit({ user: req.user, module: 'NFA', action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/nfa-tracker/:id/submit */
router.post('/:id/submit', requireRole('Admin','Requestor'), async (req, res) => {
  try {
    const ref = db.collection('approvals').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    if (doc.data().status !== 'Draft') return res.status(400).json({ error: 'Already submitted' });
    await ref.update({ status: 'Submitted', stage: 1, submittedAt: new Date() });
    await syncTransaction(req.params.id, { status: 'Submitted' });
    await writeAudit({ user: req.user, module: 'NFA', action: 'Submit', recordId: req.params.id });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/nfa-tracker/:id/approve */
router.post('/:id/approve', requireRole('Admin','Approver'), [
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

    const comment   = { text: req.body.comment || (req.body.reject ? 'Rejected' : 'Approved'), by: req.user.name || req.user.email, at: new Date(), approved: !req.body.reject };
    const comments  = [...(d.comments || []), comment];
    const newStatus = req.body.reject ? 'Rejected' : (d.stage >= 2 ? 'Approved' : 'Pending');
    const newStage  = req.body.reject ? d.stage : d.stage + 1;

    await ref.update({ status: newStatus, stage: newStage, comments, updatedAt: new Date() });
    await syncTransaction(req.params.id, { status: newStatus });
    await writeAudit({ user: req.user, module: 'NFA', action: req.body.reject ? 'Rejected' : 'Approved', recordId: req.params.id });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/nfa-tracker/upload */
router.post('/upload', requireRole('Admin','Requestor','Finance'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });
    const approvalId = req.body.approvalId;
    const base64  = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
    const fileName = req.file.originalname;

    if (approvalId) {
      const ref = db.collection('approvals').doc(approvalId);
      const doc = await ref.get();
      if (doc.exists) {
        await ref.update({ pdfUrl: dataUrl, pdfName: fileName, updatedAt: new Date() });
        await syncTransaction(approvalId, { fileUrl: dataUrl, fileName });
        await writeAudit({ user: req.user, module: 'NFA', action: 'File Upload', recordId: approvalId, newValue: { pdfName: fileName } });
      }
    }
    res.json({ url: dataUrl, fileUrl: dataUrl, name: fileName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;