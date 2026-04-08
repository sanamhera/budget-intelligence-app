/**
 * routes/dashboard.js  — FY 2026-27
 *
 * NEW:  GET /full  — single aggregated endpoint replaces 6 frontend calls.
 *       Returns: stats, analytics, aiSummary, procurementFlow, raw lists.
 *
 * PRESERVED: GET /   GET /summary   GET /analytics  (backwards compat)
 *
 * Register in app.js:
 *   app.use('/api/dashboard', require('./routes/dashboard'));
 */
const express = require('express');
const { db }   = require('../config/firebase');
const { auth } = require('../middleware/auth');

let GoogleGenAI;
try { ({ GoogleGenAI } = require('@google/genai')); } catch {}

const router = express.Router();
router.use(auth);

const FY = 'FY 2026-27';
const ai = GoogleGenAI && process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

/* ── fetch all 5 collections in parallel ───────────────────── */
async function fetchAll() {
  const [b, i, p, a, v] = await Promise.all([
    db.collection('budgets').get(),
    db.collection('invoices').get(),
    db.collection('payments').get(),
    db.collection('approvals').get(),
    db.collection('vendors').get(),
  ]);
  return {
    budgets:   b.docs.map(d => ({ id: d.id, ...d.data() })),
    invoices:  i.docs.map(d => ({ id: d.id, ...d.data() })),
    payments:  p.docs.map(d => ({ id: d.id, ...d.data() })),
    approvals: a.docs.map(d => ({ id: d.id, ...d.data() })),
    vendors:   v.docs.map(d => ({ id: d.id, ...d.data() })),
  };
}

/* ── compute KPI stats ──────────────────────────────────────── */
function computeStats({ budgets, invoices, approvals }) {
  const parents      = budgets.filter(b => !b.parentProjectId);
  const totalBudget  = parents.reduce((s, b) => s + Number(b.allocated || 0), 0);
  const totalSpent   = parents.reduce((s, b) => s + Number(b.spent     || 0), 0);
  const today        = new Date().toISOString().slice(0, 10);

  /* opex / capex split from budgetType field */
  const opexBudget  = parents.filter(b => (b.budgetType||'').toLowerCase() === 'opex')
                             .reduce((s, b) => s + Number(b.allocated || 0), 0);
  const capexBudget = parents.filter(b => (b.budgetType||'').toLowerCase() === 'capex')
                             .reduce((s, b) => s + Number(b.allocated || 0), 0);

  const pending      = invoices.filter(i => i.status === 'Pending' || i.status === 'Partial');
  const pendingAmt   = pending.reduce((s, i) => s + Number(i.amount||0) + Number(i.tax||0) - Number(i.paidAmount||0), 0);

  const overdue      = invoices.filter(i =>
    (i.status === 'Pending' || i.status === 'Partial') && i.dueDate && i.dueDate < today);
  const overdueAmt   = overdue.reduce((s, i) => s + Number(i.amount||0) + Number(i.tax||0) - Number(i.paidAmount||0), 0);

  const pendingNFA   = approvals.filter(a => a.status === 'Pending' || a.status === 'Submitted').length;
  const monthsPassed = Math.max(1, new Date().getMonth() + 1);

  return {
    totalBudget,  totalSpent,
    remaining:    totalBudget - totalSpent,
    burnRate:     totalSpent / monthsPassed,
    opexBudget,
    capexBudget,
    pendingInvoicesCount: pending.length,
    pendingPayments:      pendingAmt,
    overdueCount:         overdue.length,
    overdueAmount:        overdueAmt,
    pendingNFA,
    totalInvoices:        invoices.length,
    budgetCount:          parents.length,
    // legacy field name kept
    totalBudgets:         totalBudget,
  };
}

/* ── compute BU / GL / vendor analytics ─────────────────────── */
function computeAnalytics({ budgets, invoices }) {
  const buBudget = {}, buSpend = {}, glSpend = {}, vendorSpend = {};

  budgets.filter(b => !b.parentProjectId).forEach(b => {
    const bu  = b.businessUnit || 'Unassigned';
    const cat = (b.category || '').toLowerCase();  // 'run' or 'change'
    buBudget[bu] = (buBudget[bu] || 0) + Number(b.allocated || 0);
    buSpend[bu]  = (buSpend[bu]  || 0) + Number(b.spent     || 0);
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

  /* Run vs Change breakdown — reads spendClass field */
  const runTotal = {}, changeByBU = {};
  budgets.filter(b => !b.parentProjectId).forEach(b => {
    const bu    = b.businessUnit || 'Unassigned';
    const sc    = (b.spendClass || '').toLowerCase();  // "run (ops)" or "change (new dev)"
    const alloc = Number(b.allocated || 0);
    if (sc.startsWith('change')) {
      changeByBU[bu] = (changeByBU[bu] || 0) + alloc;
    } else {
      // 'run (ops)' or untagged → treat as Run
      runTotal[bu] = (runTotal[bu] || 0) + alloc;
    }
  });

  return { buBudget, buSpend, glSpend, vendorSpend, runTotal, changeByBU };
}

/* ── compute procurement flow ───────────────────────────────── */
function computeProcurementFlow({ budgets, invoices, payments, approvals }) {
  const parents = budgets.filter(b => !b.parentProjectId);
  const subsOf  = id => budgets.filter(b => b.parentProjectId === id);

  const nfaRaisedFor   = (id) => approvals.some(a =>
    (a.linkedProjectId === id || a.projectId === id) &&
    (a.nfaRaised || ['Submitted','Pending','Approved'].includes(a.status)));
  const nfaApprovedFor = (id) => approvals.some(a =>
    (a.linkedProjectId === id || a.projectId === id) &&
    (a.nfaApproved || a.status === 'Approved'));

  return parents.map(p => {
    const subs    = subsOf(p.id);
    const pInvs   = invoices.filter(i => i.budgetId === p.id);
    const allInvs = [...pInvs, ...subs.flatMap(s => invoices.filter(i => i.budgetId === s.id))];

    const hasNFAR = nfaRaisedFor(p.id);
    const hasNFAA = nfaApprovedFor(p.id);
    const hasInv  = allInvs.length > 0;
    const hasVen  = allInvs.some(i => i.vendorId || i.vendorName);
    const hasPay  = allInvs.some(i => payments.some(pay => pay.invoiceId === i.id));
    const isPaid  = hasInv && allInvs.every(i => i.status === 'Paid');

    return {
      id: p.id, name: p.name,
      businessUnit: p.businessUnit || '',
      budgetType:   p.budgetType   || '',
      allocated:    p.allocated    || 0,
      stages: {
        budget: true, nfaRaised: hasNFAR, nfaApproved: hasNFAA,
        vendor: hasVen, invoice: hasInv,
        payment: isPaid, paymentPartial: hasPay && !isPaid,
      },
      subs: subs.map(s => {
        const sInvs   = invoices.filter(i => i.budgetId === s.id);
        const nfaReq  = s.nfaRequired === 'yes' || s.nfaRequired === true;
        const sHasInv = sInvs.length > 0;
        const sHasVen = sInvs.some(i => i.vendorId || i.vendorName);
        const sHasPay = sInvs.some(i => payments.some(pay => pay.invoiceId === i.id));
        const sIsPaid = sHasInv && sInvs.every(i => i.status === 'Paid');
        return {
          id: s.id, name: s.taskName || s.name,
          allocated: s.allocated || 0, nfaRequired: nfaReq,
          vendorName:    sInvs.find(i => i.vendorName)?.vendorName || '',
          invoiceNumber: sInvs.find(i => i.invoiceNumber)?.invoiceNumber || '',
          stages: {
            budget: true,
            nfaRaised:   nfaReq ? (nfaRaisedFor(s.id) || s.nfaRaised > 0)   : null,
            nfaApproved: nfaReq ? (nfaApprovedFor(s.id) || s.nfaApproved > 0) : null,
            vendor: sHasVen, invoice: sHasInv,
            payment: sIsPaid, paymentPartial: sHasPay && !sIsPaid,
          },
        };
      }),
    };
  });
}

/* ── recent activities (last 10 mutations across invoices/payments) */
function computeRecentActivities({ invoices, payments }) {
  const acts = [];
  invoices.slice(-5).forEach(i => acts.push({
    type: 'invoice', label: `Invoice ${i.invoiceNumber || i.id}`,
    vendor: i.vendorName || '—', amount: Number(i.amount||0)+Number(i.tax||0),
    date: i.createdAt?._seconds ? new Date(i.createdAt._seconds*1000).toISOString() : (i.createdAt || null),
  }));
  payments.slice(-5).forEach(p => acts.push({
    type: 'payment', label: `Payment ${p.invoiceNumber || p.invoiceId}`,
    vendor: p.vendorName || '—', amount: Number(p.amount||0),
    date: p.createdAt?._seconds ? new Date(p.createdAt._seconds*1000).toISOString() : (p.createdAt || null),
  }));
  return acts.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1).slice(0, 10);
}

/* ── AI summary ─────────────────────────────────────────────── */
async function computeAISummary({ budgets, invoices }) {
  const parents    = budgets.filter(b => !b.parentProjectId);
  const overrun    = parents.filter(b => (b.spent||0) > (b.allocated||0))
    .map(b => ({ name: b.name||b.id, by: (b.spent||0)-(b.allocated||0) }));
  const nearLimit  = parents.filter(b => b.allocated && (b.spent||0)/b.allocated >= 0.85 && (b.spent||0) < b.allocated)
    .map(b => ({ name: b.name||b.id, pct: ((b.spent/b.allocated)*100).toFixed(1) }));
  const today      = new Date().toISOString().slice(0, 10);
  const overdueInv = invoices.filter(i => (i.status==='Pending'||i.status==='Partial') && i.dueDate && i.dueDate < today)
    .map(i => ({ vendor: i.vendorName||'Unknown', amt: Number(i.amount||0)+Number(i.tax||0)-Number(i.paidAmount||0), due: i.dueDate }));

  const vSpend = {};
  invoices.forEach(i => { const v = i.vendorName||'Unknown'; vSpend[v] = (vSpend[v]||0)+Number(i.amount||0)+Number(i.tax||0); });
  const topV = Object.entries(vSpend).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([n,a]) => `${n} (₹${a.toLocaleString('en-IN')})`);

  let rows = [];

  if (ai) {
    const prompt = `You are a CFO assistant. Return ONLY a valid JSON array, no markdown.
Each element: {"type":"critical"|"warning"|"good"|"info","label":string(max 3 words),"value":string(max 20 words),"action":string(max 8 words)}
Max 5 rows. Use ₹. Name specific projects/vendors.
${FY} DATA:
Overrun: ${overrun.map(p=>`"${p.name}" ₹${p.by.toLocaleString('en-IN')}`).join(';')||'None'}
Near limit: ${nearLimit.map(p=>`"${p.name}" ${p.pct}%`).join(',')||'None'}
Overdue: ${overdueInv.map(i=>`${i.vendor} ₹${i.amt.toLocaleString('en-IN')} due ${i.due}`).join(';')||'None'}
Top vendors: ${topV.join(',')||'None'}
Return only the JSON array.`.trim();
    try {
      const r = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const m = r.text.match(/\[[\s\S]*\]/);
      if (m) rows = JSON.parse(m[0]);
    } catch (e) { console.error('Gemini error:', e.message); }
  }

  if (!rows.length) {
    overrun.forEach(p => rows.push({ type:'critical', label:'Budget Overrun',
      value:`${p.name} overspent ₹${p.by.toLocaleString('en-IN')}`, action:'Review & reallocate budget' }));
    overdueInv.forEach(i => rows.push({ type:'warning', label:'Overdue Invoice',
      value:`${i.vendor} ₹${i.amt.toLocaleString('en-IN')} due ${i.due}`, action:'Initiate payment now' }));
    if (!rows.length) rows.push({ type:'good', label:'Spend Health',
      value:'All budgets within limits. No overdue invoices.', action:'No action needed' });
  }
  return rows;
}

/* ══════════════════════════════════════════════════════════════
   GET /full  — SINGLE aggregated endpoint
   Frontend makes ONE call; gets everything needed for dashboard.
══════════════════════════════════════════════════════════════ */
router.get('/full', async (req, res) => {
  try {
    const data = await fetchAll();

    // Compute everything (AI is async, rest sync)
    const [aiSummary] = await Promise.all([computeAISummary(data)]);

    const stats           = computeStats(data);
    const analytics       = computeAnalytics(data);
    const procurementFlow = computeProcurementFlow(data);
    const recentActivities= computeRecentActivities(data);

    res.json({
      fy: FY,
      stats,               // KPI numbers
      analytics,           // BU / GL / vendor spend
      aiSummary,           // AI insight cards
      procurementFlow,     // pre-computed flow for each project
      recentActivities,    // last 10 invoice/payment events
      // Raw lists for Procurement Flow component
      budgets:   data.budgets,
      approvals: data.approvals,
      invoices:  data.invoices,
      payments:  data.payments,
      vendors:   data.vendors,
    });
  } catch (e) {
    console.error('/dashboard/full error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   LEGACY ROUTES — preserved for backwards compatibility
══════════════════════════════════════════════════════════════ */
router.get('/', async (req, res) => {
  try {
    const data  = await fetchAll();
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
    const data      = await fetchAll();
    const stats     = computeStats(data);
    const analytics = computeAnalytics(data);
    res.json({ ...stats, ...analytics, fy: FY });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;