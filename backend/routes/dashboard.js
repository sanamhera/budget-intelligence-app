/**
 * routes/dashboard.js  — MongoDB
 */
const express = require('express');
const { Budget, Invoice, Payment, Approval, Vendor, ExpenseHead, Transaction } = require('../models');
const { auth } = require('../middleware/auth');
const { toClient } = require('../utils/toClient');

let GoogleGenAI;
try { ({ GoogleGenAI } = require('@google/genai')); } catch {}

const router = express.Router();
router.use(auth);

const FY = 'FY 2026-27';
const ai = GoogleGenAI && process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

async function fetchAll() {
  const [b, i, p, a, v, eh, tx] = await Promise.all([
    Budget.find().lean(),
    Invoice.find().lean(),
    Payment.find().lean(),
    Approval.find().lean(),
    Vendor.find().lean(),
    ExpenseHead.find().lean(),
    Transaction.find().lean(),
  ]);
  return {
    budgets: b.map(toClient),
    invoices: i.map(toClient),
    payments: p.map(toClient),
    approvals: a.map(toClient),
    vendors: v.map(toClient),
    expenseHeads: eh.map(toClient),
    transactions: tx.map(toClient),
  };
}

function computeStats({ expenseHeads, invoices, approvals, payments }) {
  const totalBudget = expenseHeads.reduce((s, h) => s + Number(h.allocated || 0), 0);
  const totalSpent  = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const opexBudget  = expenseHeads.reduce((s, h) => {
    const bt = (h.budgetType || '').toLowerCase();
    if (bt === 'both') return s + Number(h.opexAmount  || 0);
    if (bt === 'opex') return s + Number(h.allocated   || 0);
    return s;
  }, 0);
  const capexBudget = expenseHeads.reduce((s, h) => {
    const bt = (h.budgetType || '').toLowerCase();
    if (bt === 'both')  return s + Number(h.capexAmount || 0);
    if (bt === 'capex') return s + Number(h.allocated   || 0);
    return s;
  }, 0);

  const today = new Date().toISOString().slice(0, 10);
  const pending    = invoices.filter(i => i.status === 'Pending' || i.status === 'Partial');
  const pendingAmt = pending.reduce((s, i) => s + Number(i.amount || 0) + Number(i.tax || 0) - Number(i.paidAmount || 0), 0);
  const overdue    = invoices.filter(i =>
    (i.status === 'Pending' || i.status === 'Partial') && i.dueDate && i.dueDate < today);
  const overdueAmt = overdue.reduce((s, i) => s + Number(i.amount || 0) + Number(i.tax || 0) - Number(i.paidAmount || 0), 0);

  const pendingNFA  = approvals.filter(a => a.status === 'Pending' || a.status === 'Submitted').length;
  const monthsPassed = Math.max(1, new Date().getMonth() + 1);

  return {
    totalBudget,
    totalSpent,
    remaining: totalBudget - totalSpent,
    burnRate: totalSpent / monthsPassed,
    opexBudget,
    capexBudget,
    pendingInvoicesCount: pending.length,
    pendingPayments: pendingAmt,
    overdueCount: overdue.length,
    overdueAmount: overdueAmt,
    pendingNFA,
    totalInvoices: invoices.length,
    budgetCount: expenseHeads.length,
    totalBudgets: totalBudget,
  };
}

function computeAnalytics({ expenseHeads, invoices }) {
  const buBudget = {};
  const buSpend  = {};
  const glSpend  = {};
  const vendorSpend = {};

  expenseHeads.forEach(h => {
    const bu = h.function || 'Unassigned';
    buBudget[bu] = (buBudget[bu] || 0) + Number(h.allocated || 0);
    buSpend[bu]  = (buSpend[bu]  || 0) + Number(h.spent     || 0);
  });

  invoices.forEach(inv => {
    const amt    = Number(inv.amount || 0) + Number(inv.tax || 0);
    const vendor = inv.vendorName || 'Unknown';
    vendorSpend[vendor] = (vendorSpend[vendor] || 0) + amt;
    (inv.lineItems || []).forEach(li => {
      const gl = li.glCode || 'Unknown';
      glSpend[gl] = (glSpend[gl] || 0) + Number(li.amount || 0);
    });
  });

  const runTotal   = {};
  const changeByBU = {};
  expenseHeads.forEach(h => {
    const bu    = h.function || 'Unassigned';
    const sc    = (h.spendCategory || '').toLowerCase().trim();
    const alloc = Number(h.allocated || 0);
    if (sc === 'change') {
      changeByBU[bu] = (changeByBU[bu] || 0) + alloc;
    } else if (sc === 'run') {
      runTotal[bu] = (runTotal[bu] || 0) + alloc;
    }
    // heads with no spend category are excluded from this chart
  });

  return { buBudget, buSpend, glSpend, vendorSpend, runTotal, changeByBU };
}

function computeProcurementFlow({ expenseHeads, invoices, payments, transactions }) {
  // Group transactions by entityId for O(1) lookup
  const txByEntity = {};
  transactions.forEach(tx => {
    if (!tx.entityId) return;
    (txByEntity[tx.entityId] = txByEntity[tx.entityId] || []).push(tx);
  });

  return expenseHeads.map(head => {
    const headTxs  = txByEntity[head.id] || [];
    const headInvs = invoices.filter(i => i.expenseHeadId === head.id || i.budgetId === head.id);

    const hasNFAR = headTxs.some(t => t.type === 'NFA');
    const hasNFAA = headTxs.some(t => t.type === 'NFA' && t.status === 'Approved');
    const hasInv  = headInvs.length > 0;
    const hasVen  = headInvs.some(i => i.vendorId || i.vendorName);
    const hasPay  = headInvs.some(i => payments.some(p => p.invoiceId === i.id));
    const isPaid  = hasInv && headInvs.every(i => i.status === 'Paid');

    return {
      id: head.id,
      name: head.name,
      businessUnit: head.function || '',
      budgetType: head.budgetType || '',
      allocated: head.allocated || 0,
      stages: {
        budget: true,
        nfaRaised: hasNFAR,
        nfaApproved: hasNFAA,
        vendor: hasVen,
        invoice: hasInv,
        payment: isPaid,
        paymentPartial: hasPay && !isPaid,
      },
      subs: [],
    };
  });
}

function isoDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  if (val._seconds) return new Date(val._seconds * 1000).toISOString();
  return null;
}

function computeRecentActivities({ invoices, payments }) {
  const byDate = arr => [...arr].sort((a, b) => (isoDate(b.createdAt) || '') > (isoDate(a.createdAt) || '') ? 1 : -1);
  const acts = [];
  byDate(invoices).slice(0, 10).forEach(i => acts.push({
    type: 'invoice',
    label: `Invoice ${i.invoiceNumber || i.id}`,
    vendor: i.vendorName || '—',
    amount: Number(i.amount || 0) + Number(i.tax || 0),
    date: isoDate(i.createdAt),
  }));
  byDate(payments).slice(0, 10).forEach(p => acts.push({
    type: 'payment',
    label: `Payment ${p.invoiceNumber || p.invoiceId}`,
    vendor: p.vendorName || '—',
    amount: Number(p.amount || 0),
    date: isoDate(p.createdAt),
  }));
  return acts.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1).slice(0, 10);
}

async function computeAISummary({ expenseHeads, invoices }) {
  const overrun = expenseHeads.filter(h => (h.spent || 0) > (h.allocated || 0))
    .map(h => ({ name: h.name || h.id, by: (h.spent || 0) - (h.allocated || 0) }));
  const nearLimit = expenseHeads.filter(h => h.allocated && (h.spent || 0) / h.allocated >= 0.85 && (h.spent || 0) < h.allocated)
    .map(h => ({ name: h.name || h.id, pct: ((h.spent / h.allocated) * 100).toFixed(1) }));
  const today = new Date().toISOString().slice(0, 10);
  const overdueInv = invoices.filter(i => (i.status === 'Pending' || i.status === 'Partial') && i.dueDate && i.dueDate < today)
    .map(i => ({ vendor: i.vendorName || 'Unknown', amt: Number(i.amount || 0) + Number(i.tax || 0) - Number(i.paidAmount || 0), due: i.dueDate }));

  const vSpend = {};
  invoices.forEach(i => {
    const v = i.vendorName || 'Unknown';
    vSpend[v] = (vSpend[v] || 0) + Number(i.amount || 0) + Number(i.tax || 0);
  });
  const topV = Object.entries(vSpend).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([n, a]) => `${n} (₹${a.toLocaleString('en-IN')})`);

  let rows = [];

  if (ai) {
    const prompt = `You are a CFO assistant. Return ONLY a valid JSON array, no markdown.
Each element: {"type":"critical"|"warning"|"good"|"info","label":string(max 3 words),"value":string(max 20 words),"action":string(max 8 words)}
Max 5 rows. Use ₹. Name specific projects/vendors.
${FY} DATA:
Overrun: ${overrun.map(p => `"${p.name}" ₹${p.by.toLocaleString('en-IN')}`).join(';') || 'None'}
Near limit: ${nearLimit.map(p => `"${p.name}" ${p.pct}%`).join(',') || 'None'}
Overdue: ${overdueInv.map(i => `${i.vendor} ₹${i.amt.toLocaleString('en-IN')} due ${i.due}`).join(';') || 'None'}
Top vendors: ${topV.join(',') || 'None'}
Return only the JSON array.`.trim();
    try {
      const r = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const m = r.text.match(/\[[\s\S]*\]/);
      if (m) rows = JSON.parse(m[0]);
    } catch (e) { console.error('Gemini error:', e.message); }
  }

  if (!rows.length) {
    overrun.forEach(p => rows.push({
      type: 'critical',
      label: 'Budget Overrun',
      value: `${p.name} overspent ₹${p.by.toLocaleString('en-IN')}`,
      action: 'Review & reallocate budget',
    }));
    overdueInv.forEach(i => rows.push({
      type: 'warning',
      label: 'Overdue Invoice',
      value: `${i.vendor} ₹${i.amt.toLocaleString('en-IN')} due ${i.due}`,
      action: 'Initiate payment now',
    }));
    if (!rows.length) {
      rows.push({
        type: 'good',
        label: 'Spend Health',
        value: 'All budgets within limits. No overdue invoices.',
        action: 'No action needed',
      });
    }
  }
  return rows;
}

router.get('/full', async (req, res) => {
  try {
    const data = await fetchAll();
    const [aiSummary] = await Promise.all([computeAISummary(data)]);
    const stats = computeStats(data);
    const analytics = computeAnalytics(data);
    const procurementFlow = computeProcurementFlow(data);
    const recentActivities = computeRecentActivities(data);

    res.json({
      fy: FY,
      stats,
      analytics,
      aiSummary,
      procurementFlow,
      recentActivities,
      budgets: data.budgets,
      approvals: data.approvals,
      invoices: data.invoices,
      payments: data.payments,
      vendors: data.vendors,
    });
  } catch (e) {
    console.error('/dashboard/full error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const data = await fetchAll();
    res.json(computeStats(data));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary', async (req, res) => {
  try {
    const data = await fetchAll();
    const rows = await computeAISummary(data);
    res.json({ rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/analytics', async (req, res) => {
  try {
    const data = await fetchAll();
    const stats = computeStats(data);
    const analytics = computeAnalytics(data);
    res.json({ ...stats, ...analytics, fy: FY });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
