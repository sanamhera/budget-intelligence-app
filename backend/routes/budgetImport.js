/**
 * routes/budgetImport.js  — FY 2026-27
 *
 * Excel bulk-import for budgets.
 * Uses the xlsx npm package (already common in Node projects) to parse
 * the uploaded .xlsx file without needing Python.
 *
 * Routes:
 *   POST /api/budgets/import/preview  — parse Excel, return rows + conflict info
 *   POST /api/budgets/import/confirm  — execute the approved rows (create / update)
 *
 * Install dependency if not already present:
 *   npm install xlsx multer
 *
 * Expected columns (exact header names from template):
 *   Name *, Allocated (₹) *, Function, Budget Type, Category,
 *   Spend Category, Investment Type, NFA Required, Description,
 *   Tags, Parent Name
 */

const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const path    = require('path');
const fs      = require('fs');
const { db }  = require('../config/firebase');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

/* ── public route — no auth ─────────────────────────────────── */
router.get('/template', (req, res) => {
  const templatePath = path.join(__dirname, '..', 'templates', 'Budget_Upload_Template.xlsx');
  if (!fs.existsSync(templatePath)) {
    return res.status(404).json({
      error: 'Template not found. Place Budget_Upload_Template.xlsx in backend/templates/',
    });
  }
  res.download(templatePath, 'Budget_Upload_Template.xlsx');
});

/* ── all routes below require auth ──────────────────────────── */
router.use(auth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },  // 10 MB max
});

/* ── audit helper ───────────────────────────────────────────── */
async function audit({ user, action, recordId, newValue }) {
  try {
    await db.collection('audit').add({
      user:      user?.name || user?.email || 'Unknown',
      module:    'Budget',
      action,
      recordId:  recordId || null,
      newValue:  newValue != null ? JSON.stringify(newValue) : null,
      timestamp: new Date(),
    });
  } catch {}
}

/* ── Column name → field name map ───────────────────────────── */
const COL_MAP = {
  'name *':           'name',
  'allocated (₹) *':  'allocated',
  'allocated (rs) *': 'allocated',   // fallback without rupee symbol
  'allocated *':      'allocated',   // bare fallback
  'function':         'function',
  'budget type':      'budgetType',
  'category':         'category',
  'spend category':   'spendCategory',
  'investment type':  'investmentType',
  'nfa required':     'nfaRequired',
  'description':      'description',
  'tags':             'tags',
  'parent name':      'parentName',
};

/* ── Parse one sheet into row objects ───────────────────────── */
function parseSheet(workbook) {
  const sheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().includes('budget')
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const raw   = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  // Normalize headers
  const rows = [];
  for (const rawRow of raw) {
    const normalized = {};
    for (const [key, val] of Object.entries(rawRow)) {
      const mapped = COL_MAP[key.trim().toLowerCase()];
      if (mapped) normalized[mapped] = (val || '').toString().trim();
    }
    // Skip completely empty rows and the instruction/example rows
    if (!normalized.name || normalized.name.startsWith('★') || normalized.name.startsWith('•')) continue;
    // Skip rows that look like the legend or example marker rows
    if (['name *', 'unique expense item name'].includes(normalized.name.toLowerCase())) continue;
    rows.push(normalized);
  }
  return rows;
}

/* ── Validate a single row ───────────────────────────────────── */
function validateRow(row, rowIndex) {
  const errors = [];
  if (!row.name)                          errors.push('Name is required');
  if (!row.allocated)                     errors.push('Allocated amount is required');
  if (row.allocated && isNaN(Number(row.allocated.replace(/,/g, ''))))
                                          errors.push('Allocated must be a number');
  if (row.nfaRequired && !['yes','no',''].includes(row.nfaRequired.toLowerCase()))
                                          errors.push('NFA Required must be "yes" or "no"');
  if (row.budgetType && !['capex','opex',''].includes(row.budgetType.toLowerCase()))
                                          errors.push('Budget Type must be "Capex" or "Opex"');
  return errors;
}

/* ═══════════════════════════════════════════════════════════════
   POST /api/budgets/import/preview
   Multipart: file (xlsx)
   Returns: { rows: [...], totalRows, validRows, conflictRows, errorRows }
═══════════════════════════════════════════════════════════════ */
router.post('/preview', requireRole('Admin', 'Finance'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Excel file required' });
    const ext = (req.file.originalname || '').split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext))
      return res.status(400).json({ error: 'Only .xlsx or .xls files are supported' });

    // Parse workbook
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const parsedRows = parseSheet(workbook);

    if (!parsedRows.length)
      return res.status(400).json({ error: 'No data rows found. Make sure you are using the correct template and have not removed the header row.' });

    // Fetch all existing budgets for conflict detection (name-based)
    const existingSnap = await db.collection('budgets').get();
    const existingByName = {};
    existingSnap.docs.forEach(d => {
      const name = (d.data().name || '').trim().toLowerCase();
      existingByName[name] = { id: d.id, ...d.data() };
    });

    // Process each row
    const result = [];
    for (let i = 0; i < parsedRows.length; i++) {
      const row     = parsedRows[i];
      const errors  = validateRow(row, i);
      const nameLow = (row.name || '').toLowerCase();
      const existing = existingByName[nameLow] || null;

      // Parse tags string → array of names
      const tagNames = row.tags
        ? row.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      result.push({
        rowIndex:    i + 1,
        name:        row.name,
        allocated:   Number((row.allocated || '0').replace(/,/g, '')),
        function:    row.function       || '',
        budgetType:  row.budgetType     || '',
        category:    row.category       || '',
        spendCategory:  row.spendCategory  || '',
        investmentType: row.investmentType || '',
        nfaRequired: (row.nfaRequired || '').toLowerCase() === 'yes' ? 'yes' : 'no',
        description: row.description    || '',
        tagNames,                          // tag names to resolve on confirm
        parentName:  row.parentName     || '',
        // Conflict info
        conflict:    !!existing,
        existingId:  existing?.id        || null,
        existingAllocated: existing?.allocated || null,
        // Validation
        errors,
        // Default action (user can override in preview UI)
        action:      errors.length ? 'skip' : (existing ? 'conflict' : 'create'),
      });
    }

    res.json({
      rows:         result,
      totalRows:    result.length,
      validRows:    result.filter(r => !r.errors.length).length,
      conflictRows: result.filter(r => r.conflict && !r.errors.length).length,
      errorRows:    result.filter(r => r.errors.length).length,
    });
  } catch (e) {
    console.error('IMPORT PREVIEW ERROR:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   POST /api/budgets/import/confirm
   Body: { rows: [...] }  — same shape as preview response, but each
         row now has action: 'create' | 'update' | 'skip'
   Returns: { created, updated, skipped, errors }
═══════════════════════════════════════════════════════════════ */
router.post('/confirm', requireRole('Admin', 'Finance'), async (req, res) => {
  try {
    const rows = req.body.rows;
    if (!Array.isArray(rows) || !rows.length)
      return res.status(400).json({ error: 'No rows provided' });

    // Resolve / create tags first — build name → id map
    const allTagNames = [...new Set(rows.flatMap(r => r.tagNames || []))];
    const tagIdMap    = {};

    if (allTagNames.length) {
      const tagSnap = await db.collection('tags').get();
      tagSnap.docs.forEach(d => {
        tagIdMap[d.data().name.toLowerCase()] = d.id;
      });

      // Create missing tags
      const TAG_COLORS = [
        '#1976d2','#388e3c','#f57c00','#d32f2f','#7b1fa2',
        '#0288d1','#00796b','#afb42b','#5d4037','#455a64',
      ];
      let colorIdx = Object.keys(tagIdMap).length % TAG_COLORS.length;
      for (const name of allTagNames) {
        if (!tagIdMap[name.toLowerCase()]) {
          const data = {
            name,
            nameLower:  name.toLowerCase(),
            color:      TAG_COLORS[colorIdx % TAG_COLORS.length],
            createdAt:  new Date(),
            createdBy:  req.user.uid,
          };
          const ref = await db.collection('tags').add(data);
          tagIdMap[name.toLowerCase()] = ref.id;
          colorIdx++;
        }
      }
    }

    // Build parent name → doc ID map from rows being created
    // (so sub-tasks can reference parents in the same upload)
    const nameToNewId = {};

    let created = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const row of rows) {
      if (row.action === 'skip') { skipped++; continue; }

      // Resolve tagIds
      const tagIds = (row.tagNames || [])
        .map(n => tagIdMap[n.toLowerCase()])
        .filter(Boolean);

      // Resolve parentProjectId
      let parentProjectId = null;
      let isSubProject    = false;
      if (row.parentName) {
        // Check newly created rows in this upload first
        const lcParent = row.parentName.toLowerCase();
        parentProjectId = nameToNewId[lcParent] || null;

        // If not found locally, search Firestore
        if (!parentProjectId) {
          const pSnap = await db.collection('budgets')
            .where('name', '==', row.parentName)
            .limit(1)
            .get();
          if (!pSnap.empty) parentProjectId = pSnap.docs[0].id;
        }
        if (parentProjectId) isSubProject = true;
      }

      const data = {
        name:           row.name,
        allocated:      Number(row.allocated),
        function:       row.function       || '',
        budgetType:     row.budgetType     || '',
        category:       row.category       || '',
        spendCategory:  row.spendCategory  || '',
        investmentType: row.investmentType || '',
        nfaRequired:    row.nfaRequired    || 'no',
        nfaRaisedStatus:row.nfaRequired    || 'no',
        description:    row.description    || '',
        tagIds,
        parentProjectId,
        isSubProject,
        // Computed
        spent:          0,
        remaining:      Number(row.allocated),
        status:         'Active',
        fy:             '2026-27',
      };

      try {
        if (row.action === 'create') {
          data.createdAt = new Date();
          data.createdBy = req.user.uid;
          const ref = await db.collection('budgets').add(data);
          nameToNewId[row.name.toLowerCase()] = ref.id;
          await audit({ user: req.user, action: 'Import Create', recordId: ref.id, newValue: { name: data.name, allocated: data.allocated } });
          created++;
        } else if (row.action === 'update' && row.existingId) {
          const updateData = { ...data, updatedAt: new Date() };
          // Don't reset spent/remaining on update — preserve financial history
          delete updateData.spent;
          delete updateData.remaining;
          delete updateData.status;
          await db.collection('budgets').doc(row.existingId).update(updateData);
          nameToNewId[row.name.toLowerCase()] = row.existingId;
          await audit({ user: req.user, action: 'Import Update', recordId: row.existingId, newValue: { name: data.name, allocated: data.allocated } });
          updated++;
        }
      } catch (rowErr) {
        errors.push({ name: row.name, error: rowErr.message });
      }
    }

    res.json({ created, updated, skipped, errors });
  } catch (e) {
    console.error('IMPORT CONFIRM ERROR:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;