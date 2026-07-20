/**
 * routes/nfaTracker.js  — MongoDB; PDFs stored in GCS (served via /uploads/nfa-pdfs)
 */
const express = require('express');
const multer = require('multer');
const { Approval, ExpenseHead, PO, Transaction, AuditLog } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient, parseObjectId } = require('../utils/toClient');
const { parseNFAPDF } = require('../services/gemini');
const { uploadPdf } = require('../services/gcs');

const router = express.Router();
router.use(auth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(new Error('Only PDF files are allowed')),
});

async function writeAudit(user, action, recordId, newValue) {
  try {
    await AuditLog.create({
      user: user?.name || user?.email || 'unknown',
      module: 'NFA',
      action,
      recordId: recordId || null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      timestamp: new Date(),
    });
  } catch {}
}

async function syncTransaction(sourceId, updates) {
  if (!sourceId || !updates) return;
  try {
    await Transaction.findOneAndUpdate(
      { sourceId: String(sourceId), type: 'NFA' },
      { $set: { ...updates, updatedAt: new Date() } }
    );
  } catch {}
}

async function savePdf(buffer, originalName) {
  return uploadPdf('nfa-pdfs', buffer, originalName);
}

router.post('/parse', requireRole('Admin', 'Finance', 'Requestor'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file required' });
    const extracted = await parseNFAPDF(req.file.buffer);
    return res.status(200).json(extracted);
  } catch (e) {
    console.error('[POST /api/nfa-tracker/parse]', e.message);
    return res.status(500).json({ error: e.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.expenseHeadId) filter.expenseHeadId = req.query.expenseHeadId;
    const rows = await Approval.find(filter).lean();
    const docs = rows.map(toClient);
    docs.sort((a, b) => {
      const ta = new Date(a.createdAt || 0);
      const tb = new Date(b.createdAt || 0);
      return tb - ta;
    });
    return res.status(200).json(docs);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post(
  '/upload',
  requireRole('Admin', 'Finance', 'Requestor'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'File required' });

      const url = await savePdf(req.file.buffer, req.file.originalname);
      const fileName = req.file.originalname;

      if (req.body.approvalId) {
        const aOid = parseObjectId(req.body.approvalId);
        if (aOid) {
          const doc = await Approval.findById(aOid);
          if (doc) {
            doc.pdfUrl = url;
            doc.pdfName = fileName;
            doc.updatedAt = new Date();
            await doc.save();
            await syncTransaction(req.body.approvalId, { fileUrl: url, fileName });
          }
        }
      }

      const parsed = await parseNFAPDF(req.file.buffer);

      return res.status(200).json({
        url,
        fileUrl: url,
        fileName,
        name: fileName,
        size: req.file.size,
        preview: parsed,
      });
    } catch (e) {
      console.error('[POST /upload]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }
);

router.get('/:id', async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const doc = await Approval.findById(oid).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(toClient(doc));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post(
  '/',
  requireRole('Admin', 'Finance', 'Requestor'),
  upload.single('file'),
  async (req, res) => {
    try {
      const {
        expenseHeadId, nfaNumber, title, description,
        amount, expenseItemId, taskId, pdfUrl: bodyPdfUrl, pdfName: bodyPdfName,
      } = req.body;

      if (!expenseHeadId) return res.status(400).json({ error: 'expenseHeadId is required' });
      if (!nfaNumber) return res.status(400).json({ error: 'nfaNumber is required' });
      if (!title) return res.status(400).json({ error: 'title is required' });

      const hOid = parseObjectId(expenseHeadId);
      if (!hOid) return res.status(404).json({ error: 'Expense Head not found' });
      const headDoc = await ExpenseHead.findById(hOid).lean();
      if (!headDoc) return res.status(404).json({ error: 'Expense Head not found' });

      let pdfUrl = bodyPdfUrl || null;
      let pdfName = bodyPdfName || null;
      if (req.file) {
        pdfUrl = await savePdf(req.file.buffer, req.file.originalname);
        pdfName = req.file.originalname;
      }

      const data = {
        expenseHeadId,
        expenseItemId: expenseItemId || null,
        taskId: taskId || null,
        nfaNumber,
        title,
        description: description || '',
        amount: Number(amount) || 0,
        status: 'Draft',
        nfaRaised: false,
        nfaApproved: false,
        approvedAmount: null,
        pdfUrl,
        pdfName,
        comments: [],
        createdAt: new Date(),
        createdBy: req.user?.uid,
        createdByName: req.user?.name || req.user?.email,
      };

      const ref = await Approval.create(data);
      const id = String(ref._id);
      await writeAudit(req.user, 'Create', id, { nfaNumber: data.nfaNumber });
      return res.status(201).json({ id, ...data });
    } catch (e) {
      console.error('[POST /api/nfa-tracker]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }
);

router.patch('/:id', requireRole('Admin', 'Finance', 'Requestor', 'Approver'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const ref = await Approval.findById(oid);
    if (!ref) return res.status(404).json({ error: 'Not found' });

    const old = ref.toObject();
    const updates = { updatedAt: new Date() };
    [
      'title', 'description', 'amount', 'nfaNumber', 'nfaRaised', 'nfaApproved',
      'approvedAmount', 'pdfUrl', 'pdfName', 'status',
      'expenseHeadId', 'expenseItemId', 'taskId',
    ].forEach(k => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });

    if (updates.nfaRaised != null) {
      updates.nfaRaised = updates.nfaRaised === true || updates.nfaRaised === 'true';
    }
    if (updates.nfaApproved != null) {
      updates.nfaApproved = updates.nfaApproved === true || updates.nfaApproved === 'true';
    }
    if (updates.amount != null) updates.amount = Number(updates.amount);
    if (updates.approvedAmount != null) updates.approvedAmount = Number(updates.approvedAmount);

    if (updates.nfaRaised === false) {
      updates.nfaApproved = false;
      updates.approvedAmount = null;
      updates.status = 'Draft';
    }
    if (updates.nfaRaised === true && !old.nfaRaised) updates.status = updates.status || 'Submitted';
    if (updates.nfaApproved === true) updates.status = 'Approved';

    Object.assign(ref, updates);
    await ref.save();

    await syncTransaction(req.params.id, {
      status: ref.status,
      amount: ref.approvedAmount != null ? ref.approvedAmount : ref.amount,
    });
    await writeAudit(req.user, 'Edit', req.params.id, updates);
    return res.status(200).json(toClient(ref));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireRole('Admin', 'Finance', 'Requestor'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const ref = await Approval.findById(oid);
    if (!ref) return res.status(404).json({ error: 'Not found' });

    const linkedPo = await PO.findOne({ nfaId: req.params.id }).lean();
    if (linkedPo) {
      return res.status(400).json({ error: 'Cannot delete NFA — POs are linked to it.' });
    }

    await Approval.deleteOne({ _id: oid });
    await Transaction.deleteMany({ sourceId: req.params.id, type: 'NFA' });
    await writeAudit(req.user, 'Delete', req.params.id, null);
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/:id/submit', requireRole('Admin', 'Finance', 'Requestor'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const ref = await Approval.findById(oid);
    if (!ref) return res.status(404).json({ error: 'Not found' });
    if (ref.status !== 'Draft') return res.status(400).json({ error: 'Already submitted' });
    ref.status = 'Submitted';
    ref.nfaRaised = true;
    ref.submittedAt = new Date();
    await ref.save();
    await syncTransaction(req.params.id, { status: 'Submitted' });
    return res.status(200).json(toClient(ref));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/:id/approve', requireRole('Admin', 'Approver', 'Finance'), async (req, res) => {
  try {
    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Not found' });
    const ref = await Approval.findById(oid);
    if (!ref) return res.status(404).json({ error: 'Not found' });
    const d = ref.toObject();
    if (d.status === 'Approved' || d.status === 'Rejected') {
      return res.status(400).json({ error: 'Already decided' });
    }

    const reject = req.body.reject === true || req.body.reject === 'true';
    const newStatus = reject ? 'Rejected' : 'Approved';
    const comment = {
      text: req.body.comment || (reject ? 'Rejected' : 'Approved'),
      by: req.user?.name || req.user?.email,
      at: new Date(),
      approved: !reject,
    };
    const comments = [...(d.comments || []), comment];
    ref.status = newStatus;
    ref.comments = comments;
    ref.nfaApproved = !reject;
    ref.updatedAt = new Date();
    if (!reject && req.body.approvedAmount) ref.approvedAmount = Number(req.body.approvedAmount);
    await ref.save();

    await syncTransaction(req.params.id, { status: newStatus });
    await writeAudit(req.user, reject ? 'Reject' : 'Approve', req.params.id, { status: newStatus });
    return res.status(200).json(toClient(ref));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum is 20 MB.' });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

module.exports = router;
