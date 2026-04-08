/**
 * routes/budgets.js  — FY 2026-27
 * Changes vs original:
 *  + DELETE /:id  — delete with relational check (warns if invoices linked)
 *  + PATCH  /:id  — now also accepts nfaRaisedStatus, nfaRaised (amount),
 *                   nfaApproved (amount), nfaApprovedStatus (patched from Approvals page)
 *  + POST   /     — also accepts nfaRaisedStatus, nfaApprovalStatus
 *  + All writes fire audit log entries
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { db }  = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const STATUS = ['Active', 'Overrun', 'Closed'];

function getStatus(allocated, spent) {
  return spent > allocated ? 'Overrun' : 'Active';
}

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
    const snap = await db.collection('budgets').orderBy('createdAt', 'desc').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET single ──────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('budgets').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST create ─────────────────────────────────────────────── */
/* Sub-tasks/sub-projects can be created by any authenticated role;
   top-level project creation still requires Admin or Finance.       */
router.post('/', async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      name, allocated, description,
      businessUnit, category, spendCategory, investmentType, budgetType,
      nfaRaisedStatus, nfaApprovalStatus,
      // Sub-project fields
      parentProjectId, isSubProject, itemType, nfaRequired,
      taskName,
    } = req.body;

    // Top-level projects still require Admin/Finance
    if (!parentProjectId) {
      const allowed = ['Admin', 'Finance'];
      if (!allowed.includes(req.user?.role)) {
        return res.status(403).json({ error: 'Only Admin or Finance can create top-level projects.' });
      }
    }

    const data = {
      name:              taskName || name,
      allocated:         Number(allocated),
      spent:             0,
      remaining:         Number(allocated),
      status:            'Active',
      description:       description       || '',
      businessUnit:      businessUnit      || '',
      category:          category          || '',
      spendCategory:     spendCategory     || '',
      investmentType:    investmentType    || '',
      budgetType:        budgetType        || '',
      // NFA status columns
      nfaRaisedStatus:   nfaRaisedStatus   || 'no',
      nfaRaised:         0,
      nfaApprovalStatus: nfaApprovalStatus || '',
      nfaApproved:       0,
      // Sub-project linkage
      parentProjectId:   parentProjectId   || null,
      isSubProject:      isSubProject      || false,
      itemType:          itemType          || null,
      nfaRequired:       nfaRequired       || 'no',
      createdAt:         new Date(),
      createdBy:         req.user.uid,
      fy:                '2026-27',
    };

    const ref = await db.collection('budgets').add(data);
    await audit({ user: req.user, module: 'Budget', action: isSubProject ? 'AddSubTask' : 'Create', recordId: ref.id, newValue: data });
    res.status(201).json({ id: ref.id, ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── PATCH update ────────────────────────────────────────────── */
router.patch('/:id', [
  body('name').optional().notEmpty(),
  body('allocated').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(STATUS),
  body('nfaRaised').optional(),
  body('nfaApproved').optional(),
], async (req, res) => {
  try {
    const docRef = db.collection('budgets').doc(req.params.id);
    const doc    = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });

    const current = doc.data();
    const old     = { id: doc.id, ...current };
    const updates = { updatedAt: new Date() };

    // Editable metadata fields
    const metaFields = ['name','description','businessUnit','category','spendClass','spendCategory','investmentType','budgetType','financialYear','status'];
    metaFields.forEach(k => { if (req.body[k] != null) updates[k] = req.body[k]; });

    if (req.body.allocated != null) {
      updates.allocated = Number(req.body.allocated);
      updates.remaining = updates.allocated - (current.spent || 0);
      updates.status    = getStatus(updates.allocated, current.spent || 0);
    }

    // NFA status fields — patched by Approvals page when NFA is raised/approved
    if (req.body.nfaRaisedStatus   != null) updates.nfaRaisedStatus   = req.body.nfaRaisedStatus;
    if (req.body.nfaApprovalStatus != null) updates.nfaApprovalStatus = req.body.nfaApprovalStatus;
    if (req.body.nfaApprovedStatus != null) updates.nfaApprovedStatus = req.body.nfaApprovedStatus;

    // nfaRaised / nfaApproved as amounts (numbers)
    if (req.body.nfaRaised   != null) updates.nfaRaised   = Number(req.body.nfaRaised);
    if (req.body.nfaApproved != null) updates.nfaApproved = Number(req.body.nfaApproved);

    if (Object.keys(updates).length > 1) {  // >1 because updatedAt always present
      await docRef.update(updates);
      await audit({ user: req.user, module: 'Budget', action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    }

    const updated = await docRef.get();
    res.json({ success: true, message: 'Project updated successfully', id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── DELETE ──────────────────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  try {
    const ref = db.collection('budgets').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const old = { id: doc.id, ...doc.data() };

    // Relational check — warn client but still allow (frontend shows a warning dialog)
    const linkedInvoices = await db.collection('invoices').where('budgetId', '==', req.params.id).limit(1).get();
    const hasLinked = !linkedInvoices.empty;

    await ref.delete();
    await audit({ user: req.user, module: 'Budget', action: 'Delete', recordId: req.params.id, oldValue: old });
    res.json({ success: true, hadLinkedInvoices: hasLinked });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;