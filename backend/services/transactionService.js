/**
 * services/transactionService.js
 *
 * Single source of truth for all transaction operations.
 * Routes never write to `transactions` or `pos` directly — they call this service.
 *
 * Responsibilities:
 *   - Create / update / delete transactions
 *   - Enforce NFA → PO → Invoice → Payment stage rules
 *   - Compute rollup summaries for any entity
 *   - Sync PO status when invoices are added
 */

const { db } = require('../config/firebase');

/* ─────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────── */
const TX_TYPES   = ['NFA', 'PO', 'INVOICE', 'PAYMENT'];
const ENTITY_TYPES = ['expense', 'expenseItem', 'task'];

/* ─────────────────────────────────────────────────────────────
   AUDIT
───────────────────────────────────────────────────────────── */
async function writeAudit({ user, module, action, recordId, oldValue, newValue }) {
  try {
    await db.collection('audit').add({
      user:      user?.name || user?.email || 'system',
      module,
      action,
      recordId:  recordId || null,
      oldValue:  oldValue  != null ? JSON.stringify(oldValue)  : null,
      newValue:  newValue  != null ? JSON.stringify(newValue)  : null,
      timestamp: new Date(),
    });
  } catch { /* never break main flow */ }
}

/* ─────────────────────────────────────────────────────────────
   STAGE VALIDATION
   Rules:
     - NFA not required → PO is first stage
     - NFA required     → PO only after at least one NFA with status Approved
     - INVOICE          → only after a PO exists for this entity
     - PAYMENT          → only after an invoice exists
───────────────────────────────────────────────────────────── */
async function validateStage({ type, entityId, nfaRequired = 'no' }) {
  if (type === 'NFA') return { allowed: true };

  const txSnap = await db.collection('transactions')
    .where('entityId', '==', entityId)
    .get();
  const txList = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (type === 'PO') {
    if (nfaRequired === 'yes') {
      const approvedNFA = txList.find(t => t.type === 'NFA' && t.status === 'Approved');
      if (!approvedNFA) {
        return { allowed: false, reason: 'NFA is required for this entity. A PO can only be raised after NFA is approved.' };
      }
    }
    return { allowed: true };
  }

  if (type === 'INVOICE') {
    // Invoice must be linked to a PO
    return { allowed: true }; // PO linkage enforced at route level via poId
  }

  if (type === 'PAYMENT') {
    const hasInvoice = txList.some(t => t.type === 'INVOICE');
    if (!hasInvoice) {
      return { allowed: false, reason: 'A payment cannot be recorded before an invoice exists.' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: `Unknown transaction type: ${type}` };
}

/* ─────────────────────────────────────────────────────────────
   GET ENTITY NFA REQUIREMENT
   Looks up the entity's nfaRequired field from the correct collection
───────────────────────────────────────────────────────────── */
async function getEntityNfaRequired(entityId, entityType) {
  const collectionMap = {
    expense:     'expenses',
    expenseItem: 'subExpenses',
    task:        'subTasks',
  };
  const col = collectionMap[entityType];
  if (!col) return 'no';
  try {
    const doc = await db.collection(col).doc(entityId).get();
    return doc.exists ? (doc.data().nfaRequired || 'no') : 'no';
  } catch {
    return 'no';
  }
}

/* ─────────────────────────────────────────────────────────────
   CREATE TRANSACTION
───────────────────────────────────────────────────────────── */
async function createTransaction({ type, entityId, entityType, vendorName = '',
  amount = 0, description = '', fileUrl = null, fileName = null,
  status = null, sourceId = null, user = {} }) {

  if (!TX_TYPES.includes(type))       throw new Error(`Invalid type: ${type}`);
  if (!entityId)                      throw new Error('entityId is required');

  // Resolve nfaRequired from entity
  const nfaRequired = await getEntityNfaRequired(entityId, entityType);

  // Validate stage
  const stage = await validateStage({ type, entityId, nfaRequired });
  if (!stage.allowed) throw new Error(stage.reason);

  // Default statuses per type
  const defaultStatus = {
    NFA:     'Draft',
    PO:      'Issued',
    INVOICE: 'Pending',
    PAYMENT: 'Completed',
  };

  const data = {
    type,
    entityId,
    entityType:    entityType || 'expense',
    vendorName:    vendorName || '',
    amount:        Number(amount) || 0,
    description:   description || '',
    fileUrl:       fileUrl || null,
    fileName:      fileName || null,
    status:        status || defaultStatus[type],
    sourceId:      sourceId || null,
    createdAt:     new Date(),
    createdBy:     user.uid     || 'system',
    createdByName: user.name    || user.email || 'system',
  };

  const ref = await db.collection('transactions').add(data);
  await writeAudit({ user, module: 'Transaction', action: `Create ${type}`, recordId: ref.id, newValue: data });
  return { id: ref.id, ...data };
}

/* ─────────────────────────────────────────────────────────────
   UPDATE TRANSACTION
───────────────────────────────────────────────────────────── */
async function updateTransaction(txId, updates, user = {}) {
  const ref = db.collection('transactions').doc(txId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error('Transaction not found');

  const old     = { id: doc.id, ...doc.data() };
  const allowed = ['status', 'fileUrl', 'fileName', 'vendorName', 'description', 'amount'];
  const clean   = {};
  allowed.forEach(k => { if (updates[k] != null) clean[k] = updates[k]; });
  if (clean.amount != null) clean.amount = Number(clean.amount);
  clean.updatedAt = new Date();

  await ref.update(clean);
  await writeAudit({ user, module: 'Transaction', action: 'Update', recordId: txId, oldValue: old, newValue: clean });
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
}

/* ─────────────────────────────────────────────────────────────
   DELETE TRANSACTION
───────────────────────────────────────────────────────────── */
async function deleteTransaction(txId, user = {}) {
  const ref = db.collection('transactions').doc(txId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error('Transaction not found');
  const old = { id: doc.id, ...doc.data() };
  await ref.delete();
  await writeAudit({ user, module: 'Transaction', action: 'Delete', recordId: txId, oldValue: old });
  return { success: true };
}

/* ─────────────────────────────────────────────────────────────
   GET TRANSACTIONS FOR ENTITY
───────────────────────────────────────────────────────────── */
async function getTransactionsForEntity(entityId) {
  const [txSnap, posSnap] = await Promise.all([
    db.collection('transactions').where('entityId', '==', entityId).orderBy('createdAt', 'asc').get(),
    db.collection('pos').where('entityId', '==', entityId).orderBy('createdAt', 'asc').get(),
  ]);
  return {
    transactions: txSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    pos:          posSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  };
}

/* ─────────────────────────────────────────────────────────────
   COMPUTE ROLLUP FOR ENTITY
   Returns derived counts and amounts — never stored, always computed
───────────────────────────────────────────────────────────── */
async function computeRollup(entityId) {
  const { transactions, pos } = await getTransactionsForEntity(entityId);

  const nfaList     = transactions.filter(t => t.type === 'NFA');
  const invoiceList = transactions.filter(t => t.type === 'INVOICE');
  const paymentList = transactions.filter(t => t.type === 'PAYMENT');

  const totalInvoiced = invoiceList.reduce((s, t) => s + (t.amount || 0), 0);
  const totalPaid     = paymentList.reduce((s, t) => s + (t.amount || 0), 0);
  const totalPOValue  = pos.reduce((s, p) => s + (p.amount || 0), 0);

  // NFA approved = any NFA with status Approved
  const nfaApproved   = nfaList.some(t => t.status === 'Approved');
  const nfaRequired   = nfaList.length > 0; // at least one NFA was raised

  return {
    nfaCount:      nfaList.length,
    nfaApproved,
    poCount:       pos.length,
    poValue:       totalPOValue,
    invoiceCount:  invoiceList.length,
    invoiced:      totalInvoiced,
    paymentCount:  paymentList.length,
    paid:          totalPaid,
    outstanding:   totalInvoiced - totalPaid,
  };
}

/* ─────────────────────────────────────────────────────────────
   CREATE PO
───────────────────────────────────────────────────────────── */
async function createPO({ entityId, entityType, vendorName, amount, poNumber = '',
  description = '', status = 'Draft', user = {} }) {

  if (!entityId)   throw new Error('entityId is required');
  if (!vendorName) throw new Error('vendorName is required');
  if (!amount)     throw new Error('amount is required');

  // Stage check — same as PO transaction
  const nfaRequired = await getEntityNfaRequired(entityId, entityType);
  const stage = await validateStage({ type: 'PO', entityId, nfaRequired });
  if (!stage.allowed) throw new Error(stage.reason);

  const data = {
    entityId,
    entityType:    entityType || 'expense',
    vendorName,
    amount:        Number(amount),
    poNumber:      poNumber || '',
    description:   description || '',
    status,
    invoices:      [],
    pdfUrl:        null,
    pdfName:       null,
    createdAt:     new Date(),
    createdBy:     user.uid     || 'system',
    createdByName: user.name    || user.email || 'system',
  };

  const ref = await db.collection('pos').add(data);
  await writeAudit({ user, module: 'PO', action: 'Create', recordId: ref.id, newValue: data });
  return { id: ref.id, ...data };
}

/* ─────────────────────────────────────────────────────────────
   ADD INVOICE TO PO
───────────────────────────────────────────────────────────── */
async function addInvoiceToPO(poId, { vendorName, invoiceNumber = '', amount, tax = 0, date = '' }, user = {}) {
  const ref = db.collection('pos').doc(poId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error('PO not found');

  const { FieldValue } = require('firebase-admin/firestore');
  const invoice = {
    id:            `inv_${Date.now()}`,
    vendorName:    vendorName || '',
    invoiceNumber: invoiceNumber || '',
    amount:        Number(amount) || 0,
    tax:           Number(tax)    || 0,
    date:          date || new Date().toISOString().slice(0, 10),
    status:        'Pending',
    createdAt:     new Date().toISOString(),
    createdBy:     user.uid || 'system',
  };

  await ref.update({ invoices: FieldValue.arrayUnion(invoice), updatedAt: new Date() });

  // Also write to transactions for unified rollup
  await createTransaction({
    type:        'INVOICE',
    entityId:    doc.data().entityId,
    entityType:  doc.data().entityType,
    vendorName:  vendorName || '',
    amount:      invoice.amount + invoice.tax,
    description: invoiceNumber ? `Invoice #${invoiceNumber}` : 'Invoice',
    status:      'Pending',
    sourceId:    poId,
    user,
  });

  await writeAudit({ user, module: 'PO', action: 'Add Invoice', recordId: poId, newValue: invoice });
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
}

/* ─────────────────────────────────────────────────────────────
   FULL HIERARCHY WITH ROLLUP
   Returns nested structure for GET /api/expense-heads
───────────────────────────────────────────────────────────── */
async function buildHierarchy(budgetId) {
  // Fetch all entities in parallel
  const [headSnap, itemSnap, taskSnap] = await Promise.all([
    db.collection('expenses').where('budgetId', '==', budgetId).orderBy('createdAt', 'asc').get(),
    db.collection('subExpenses').where('budgetId', '==', budgetId).orderBy('createdAt', 'asc').get(),
    db.collection('subTasks').where('budgetId', '==', budgetId).orderBy('createdAt', 'asc').get(),
  ]);

  const heads = headSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const items = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tasks = taskSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Fetch all transaction rollups in parallel
  const allEntityIds = [
    ...heads.map(h => h.id),
    ...items.map(i => i.id),
    ...tasks.map(t => t.id),
  ];

  const rollups = {};
  await Promise.all(
    allEntityIds.map(async id => {
      rollups[id] = await computeRollup(id);
    })
  );

  // Build nested structure
  const result = heads.map(head => {
    const headItems = items.filter(i => i.expenseId === head.id).map(item => {
      const itemTasks = tasks.filter(t => t.subExpenseId === item.id).map(task => ({
        ...task,
        ...rollups[task.id],
        level: 'task',
      }));
      return {
        ...item,
        ...rollups[item.id],
        level: 'expenseItem',
        tasks: itemTasks,
      };
    });

    const directTasks = tasks.filter(t => t.expenseId === head.id && t.parentType === 'expense').map(task => ({
      ...task,
      ...rollups[task.id],
      level: 'task',
    }));

    // Roll up allocated/spent from children
    const childAllocated = [
      ...headItems.map(i => i.allocated || 0),
      ...directTasks.map(t => t.allocated || 0),
    ].reduce((s, v) => s + v, 0);

    const childSpent = [
      ...headItems.map(i => i.spent || 0),
      ...directTasks.map(t => t.spent || 0),
    ].reduce((s, v) => s + v, 0);

    const headRollup = rollups[head.id];
    const totalAllocated = (head.allocated || 0) + childAllocated;
    const totalSpent     = (head.spent || 0) + childSpent;

    return {
      ...head,
      ...headRollup,
      level:        'expenseHead',
      allocated:    totalAllocated,
      spent:        totalSpent,
      remaining:    totalAllocated - totalSpent,
      status:       totalSpent > totalAllocated ? 'Overrun' : 'Active',
      expenseItems: headItems,
      directTasks,
      // Child counts
      expenseItemCount: headItems.length,
      taskCount:        headItems.reduce((s, i) => s + i.tasks.length, 0) + directTasks.length,
    };
  });

  return result;
}

module.exports = {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionsForEntity,
  computeRollup,
  createPO,
  addInvoiceToPO,
  buildHierarchy,
  validateStage,
  writeAudit,
};