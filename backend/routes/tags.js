/**
 * routes/tags.js  — MongoDB
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { Tag, Budget, ExpenseHead, ExpenseItem, Task, AuditLog } = require('../models');
const { auth, requireRole } = require('../middleware/auth');
const { toClient, parseObjectId } = require('../utils/toClient');

const router = express.Router();
router.use(auth);

const VALID_COLORS = [
  '#7C3AED', '#DB2777', '#EA580C', '#D97706', '#059669',
  '#0D9488', '#DC2626', '#9333EA', '#0891B2', '#65A30D',
  '#92400E', '#C026D3', '#E11D48', '#16A34A', '#475569',
];

async function audit({ user, action, recordId, oldValue, newValue }) {
  try {
    await AuditLog.create({
      user: user?.name || user?.email || 'Unknown',
      module: 'Tags',
      action,
      recordId: recordId || null,
      oldValue: oldValue != null ? JSON.stringify(oldValue) : null,
      newValue: newValue != null ? JSON.stringify(newValue) : null,
      timestamp: new Date(),
    });
  } catch {}
}

router.get('/', async (req, res) => {
  try {
    const rows = await Tag.find().lean();
    const docs = rows.map(toClient).sort((a, b) => a.name.localeCompare(b.name));
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const [tags, heads] = await Promise.all([
      Tag.find().lean(),
      ExpenseHead.find().lean(),
    ]);
    const result = tags.map(tag => {
      const tagId = String(tag._id);
      const tagged = heads.filter(h => (h.tagIds || []).includes(tagId));
      return {
        id: tagId,
        name: tag.name,
        color: tag.color || '#6366F1',
        budget: tagged.reduce((s, h) => s + (Number(h.allocated) || 0), 0),
        spent:  tagged.reduce((s, h) => s + (Number(h.spent)     || 0), 0),
        headCount: tagged.length,
      };
    }).filter(t => t.headCount > 0 || t.budget > 0);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', [
  body('name').notEmpty().withMessage('Tag name is required').trim(),
  body('color').optional(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const name = req.body.name.trim();
    const color = VALID_COLORS.includes(req.body.color) ? req.body.color : VALID_COLORS[0];

    const existing = await Tag.findOne({ nameLower: name.toLowerCase() }).lean();
    if (existing) return res.status(409).json({ error: 'A tag with this name already exists' });

    const data = {
      name,
      nameLower: name.toLowerCase(),
      color,
      createdAt: new Date(),
      createdBy: req.user.uid,
    };

    const ref = await Tag.create(data);
    await audit({ user: req.user, action: 'Create', recordId: String(ref._id), newValue: data });
    res.status(201).json({ id: String(ref._id), ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireRole('Admin', 'Finance'), [
  body('name').optional().notEmpty().trim(),
  body('color').optional(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const oid = parseObjectId(req.params.id);
    if (!oid) return res.status(404).json({ error: 'Tag not found' });
    const doc = await Tag.findById(oid);
    if (!doc) return res.status(404).json({ error: 'Tag not found' });

    const old = toClient(doc.toObject());
    const updates = { updatedAt: new Date() };

    if (req.body.name != null) {
      const name = req.body.name.trim();
      if (name.toLowerCase() !== old.nameLower) {
        const clash = await Tag.findOne({ nameLower: name.toLowerCase(), _id: { $ne: oid } }).lean();
        if (clash) return res.status(409).json({ error: 'A tag with this name already exists' });
      }
      updates.name = name;
      updates.nameLower = name.toLowerCase();
    }

    if (req.body.color != null) {
      updates.color = VALID_COLORS.includes(req.body.color) ? req.body.color : old.color;
    }

    Object.assign(doc, updates);
    await doc.save();
    await audit({ user: req.user, action: 'Edit', recordId: req.params.id, oldValue: old, newValue: updates });
    res.json(toClient(doc));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try {
    const tagId = req.params.id;
    const oid = parseObjectId(tagId);
    if (!oid) return res.status(404).json({ error: 'Tag not found' });
    const doc = await Tag.findById(oid);
    if (!doc) return res.status(404).json({ error: 'Tag not found' });
    const old = toClient(doc.toObject());

    await Promise.all([
      Budget.updateMany({ tagIds: tagId }, { $pull: { tagIds: tagId } }),
      ExpenseHead.updateMany({ tagIds: tagId }, { $pull: { tagIds: tagId } }),
      ExpenseItem.updateMany({ tagIds: tagId }, { $pull: { tagIds: tagId } }),
      Task.updateMany({ tagIds: tagId }, { $pull: { tagIds: tagId } }),
    ]);

    const subBudgets = await Budget.find({
      isSubProject: true,
      subTasks: { $exists: true, $ne: [] },
    }).lean();

    for (const b of subBudgets) {
      const st = b.subTasks;
      if (!Array.isArray(st)) continue;
      const has = st.some(s => (s.tagIds || []).includes(tagId));
      if (!has) continue;
      const updatedSubTasks = st.map(s => ({
        ...s,
        tagIds: (s.tagIds || []).filter(t => t !== tagId),
      }));
      await Budget.updateOne({ _id: b._id }, { $set: { subTasks: updatedSubTasks } });
    }

    await Tag.deleteOne({ _id: oid });
    await audit({ user: req.user, action: 'Delete', recordId: tagId, oldValue: old });

    res.json({ success: true, cascaded: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
