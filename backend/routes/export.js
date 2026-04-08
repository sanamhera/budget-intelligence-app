/**
 * routes/export.js  — FY 2026-27  [NEW FILE]
 * GET /export/budgets      → downloads Budget table as .xlsx
 * GET /export/opex-capex   → downloads OPEX/CAPEX Budget vs Expense report as .xlsx
 *
 * Uses exceljs (npm install exceljs)
 */
const express = require('express');
const ExcelJS = require('exceljs');
const { db }  = require('../config/firebase');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const FY = 'FY 2026-27';

/* ── helper: fetch all budgets + invoices ───────────────────── */
async function getData() {
  const [budgetSnap, invoiceSnap] = await Promise.all([
    db.collection('budgets').orderBy('createdAt', 'desc').get(),
    db.collection('invoices').orderBy('createdAt', 'desc').get(),
  ]);
  const budgets  = budgetSnap.docs.map(d  => ({ id: d.id,  ...d.data()  }));
  const invoices = invoiceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { budgets, invoices };
}

/* ── helper: style header row ───────────────────────────────── */
function styleHeader(row, fillColor = '4F6EF7') {
  row.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fillColor } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border    = {
      top:    { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right:  { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  });
}

/* ── GET /export/budgets ─────────────────────────────────────── */
router.get('/budgets', async (req, res) => {
  try {
    const { budgets } = await getData();

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Budget Intelligence Platform';
    wb.created  = new Date();

    const ws = wb.addWorksheet(`Budget Table — ${FY}`);

    // Title row
    ws.mergeCells('A1:J1');
    ws.getCell('A1').value     = `Budget Table — ${FY}`;
    ws.getCell('A1').font      = { bold: true, size: 14, color: { argb: 'FF4F6EF7' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;
    ws.addRow([]);

    // Column definitions
    ws.columns = [
      { header: 'Project Name',     key: 'name',          width: 28 },
      { header: 'Business Unit',    key: 'businessUnit',  width: 18 },
      { header: 'Budget Type',      key: 'budgetType',    width: 12 },
      { header: 'Category',         key: 'category',      width: 18 },
      { header: 'Spend Category',   key: 'spendCategory', width: 14 },
      { header: 'Investment Type',  key: 'investmentType',width: 18 },
      { header: 'Budget Amount (₹)',key: 'allocated',     width: 18 },
      { header: 'Spent (₹)',        key: 'spent',         width: 16 },
      { header: 'Remaining (₹)',    key: 'remaining',     width: 16 },
      { header: 'Status',           key: 'status',        width: 12 },
    ];

    const headerRow = ws.getRow(3);
    styleHeader(headerRow);

    budgets.forEach((b, i) => {
      const row = ws.addRow({
        name:          b.name          || '',
        businessUnit:  b.businessUnit  || '',
        budgetType:    b.budgetType    || '',
        category:      b.category      || '',
        spendCategory: b.spendCategory || '',
        investmentType:b.investmentType|| '',
        allocated:     Number(b.allocated  || 0),
        spent:         Number(b.spent      || 0),
        remaining:     Number(b.remaining  ?? ((b.allocated||0) - (b.spent||0))),
        status:        b.status        || 'Active',
      });

      // Stripe rows
      if (i % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
        });
      }

      // Colour remaining: red if negative
      const remaining = Number(b.remaining ?? ((b.allocated||0)-(b.spent||0)));
      const remCell = row.getCell('remaining');
      remCell.font = { color: { argb: remaining < 0 ? 'FFEF4444' : 'FF10B981' }, bold: true };

      // Number format
      ['allocated','spent','remaining'].forEach(k => {
        row.getCell(k).numFmt = '₹#,##0.00';
      });
    });

    // Totals row
    const totals = budgets.reduce((acc, b) => {
      acc.allocated += Number(b.allocated||0);
      acc.spent     += Number(b.spent||0);
      acc.remaining += Number(b.remaining ?? ((b.allocated||0)-(b.spent||0)));
      return acc;
    }, { allocated:0, spent:0, remaining:0 });

    const totalRow = ws.addRow({
      name: 'TOTAL', businessUnit:'', budgetType:'', category:'', spendCategory:'', investmentType:'',
      allocated: totals.allocated, spent: totals.spent, remaining: totals.remaining, status: '',
    });
    totalRow.font = { bold: true };
    totalRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    });
    ['allocated','spent','remaining'].forEach(k => { totalRow.getCell(k).numFmt = '₹#,##0.00'; });

    ws.autoFilter = { from: 'A3', to: 'J3' };

    // Stream to client
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Budget_${FY.replace(/\s/g,'_')}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('EXPORT /budgets error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /export/opex-capex ─────────────────────────────────── */
router.get('/opex-capex', async (req, res) => {
  try {
    const { budgets, invoices } = await getData();

    // Build project → expense map from invoices
    const expenseByProject = {};
    invoices.forEach(inv => {
      const id = inv.budgetId || inv.projectId;
      if (!id) return;
      expenseByProject[id] = (expenseByProject[id] || 0) + Number(inv.amount||0) + Number(inv.tax||0);
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Budget Intelligence Platform';

    const makeSheet = (label, type, fillHex) => {
      const ws    = wb.addWorksheet(label);
      const items = budgets.filter(b => (b.budgetType||'').toLowerCase() === type.toLowerCase());

      ws.mergeCells('A1:F1');
      ws.getCell('A1').value     = `${label} — Budget vs Expense — ${FY}`;
      ws.getCell('A1').font      = { bold:true, size:13, color:{ argb:'FF' + fillHex } };
      ws.getCell('A1').alignment = { horizontal:'center' };
      ws.getRow(1).height = 26;
      ws.addRow([]);

      ws.columns = [
        { header:'Business Unit', key:'businessUnit', width:18 },
        { header:'Project Name',  key:'name',         width:28 },
        { header:'Month',         key:'month',        width:12 },
        { header:'Budget (₹)',    key:'budget',       width:16 },
        { header:'Expense (₹)',   key:'expense',      width:16 },
        { header:'Variance (₹)',  key:'variance',     width:16 },
      ];

      styleHeader(ws.getRow(3), fillHex);

      items.forEach((b, i) => {
        const expense  = expenseByProject[b.id] || 0;
        const budget   = Number(b.allocated || 0);
        const variance = budget - expense;

        const row = ws.addRow({
          businessUnit: b.businessUnit || '',
          name:         b.name         || '',
          month:        FY,
          budget,
          expense,
          variance,
        });

        if (i % 2 === 0) {
          row.eachCell(cell => {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF8FAFF' } };
          });
        }

        ['budget','expense'].forEach(k => { row.getCell(k).numFmt = '₹#,##0.00'; });
        const varCell = row.getCell('variance');
        varCell.numFmt = '₹#,##0.00';
        varCell.font   = { color:{ argb: variance < 0 ? 'FFEF4444' : 'FF10B981' }, bold:true };
      });

      // Totals
      const totals = items.reduce((acc,b)=>{
        const expense = expenseByProject[b.id]||0;
        acc.budget  += Number(b.allocated||0);
        acc.expense += expense;
        acc.variance+= Number(b.allocated||0) - expense;
        return acc;
      },{ budget:0, expense:0, variance:0 });

      const tr = ws.addRow({ businessUnit:'TOTAL', name:'', month:'', ...totals });
      tr.font = { bold:true };
      tr.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFDBEAFE'}};});
      ['budget','expense','variance'].forEach(k=>{ tr.getCell(k).numFmt='₹#,##0.00'; });

      ws.autoFilter = { from:'A3', to:'F3' };
    };

    makeSheet('OPEX',  'Opex',  '7C3AED');
    makeSheet('CAPEX', 'Capex', '0EA5E9');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="OPEX_CAPEX_${FY.replace(/\s/g,'_')}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('EXPORT /opex-capex error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;