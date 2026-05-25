/**
 * services/transactionService.js — MongoDB / Mongoose
 */

const {
  AuditLog,
  Transaction,
  PO,
  Expense,
  SubExpense,
  SubTask,
  ExpenseHead,
  Budget,
} = require('../models');
const { toClient, parseObjectId } = require('../utils/toClient');

const TX_TYPES = ['NFA', 'PO', 'INVOICE', 'PAYMENT'];

async function writeAudit({ user, module, action, recordId, oldValue, newValue }) {
  try {
    await AuditLog.create({
      user: user?.name || user?.email || 'system',
      module,
      action,
      recordId: recordId || null,
      oldValue: oldValue != null ? JSON.stringify(oldValue) : null,
      newValue: newValue != null ? JSON.stringify(newValue) : null,
      timestamp: new Date(),
    });
  } catch { /* never break main flow */ }
}

function normalizeEntityType(entityType) {
  const t = String(entityType || 'expense').toLowerCase();
  if (t === 'budget') return 'budget';
  if (t === 'expensehead' || t === 'expense_head') return 'expenseHead';
  if (t === 'expenseitem' || t === 'subexpense') return 'expenseItem';
  if (t === 'task' || t === 'subtask') return 'task';
  return 'expense';
}

async function getEntityNfaRequired(entityId, entityType) {
  const kind = normalizeEntityType(entityType);
  const modelMap = {
    budget: Budget,
    expense: Expense,
    expenseHead: ExpenseHead,
    expenseItem: SubExpense,
    task: SubTask,
  };
  const Model = modelMap[kind];
  if (!Model) return 'no';
  try {
    const oid = parseObjectId(entityId);
    if (!oid) return 'no';
    const doc = await Model.findById(oid).lean();
    return doc ? (doc.nfaRequired || 'no') : 'no';
  } catch {
    return 'no';
  }
}

async function validateStage({ type, entityId, nfaRequired = 'no' }) {
  if (type === 'NFA') return { allowed: true };

  const txList = await Transaction.find({ entityId }).lean();

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
    return { allowed: true };
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

async function createTransaction({
  type,
  entityId,
  entityType,
  vendorName = '',
  amount = 0,
  description = '',
  fileUrl = null,
  fileName = null,
  status = null,
  sourceId = null,
  user = {},
}) {
  if (!TX_TYPES.includes(type)) throw new Error(`Invalid type: ${type}`);
  if (!entityId) throw new Error('entityId is required');

  const nfaRequired = await getEntityNfaRequired(entityId, entityType);
  const stage = await validateStage({ type, entityId, nfaRequired });
  if (!stage.allowed) throw new Error(stage.reason);

  const defaultStatus = {
    NFA: 'Draft',
    PO: 'Issued',
    INVOICE: 'Pending',
    PAYMENT: 'Completed',
  };

  const data = {
    type,
    entityId,
    entityType: entityType || 'expense',
    vendorName: vendorName || '',
    amount: Number(amount) || 0,
    description: description || '',
    fileUrl: fileUrl || null,
    fileName: fileName || null,
    status: status || defaultStatus[type],
    sourceId: sourceId || null,
    createdAt: new Date(),
    createdBy: user.uid || 'system',
    createdByName: user.name || user.email || 'system',
  };

  const created = await Transaction.create(data);
  await writeAudit({ user, module: 'Transaction', action: `Create ${type}`, recordId: String(created._id), newValue: data });
  return toClient(created);
}

async function updateTransaction(txId, updates, user = {}) {
  const oid = parseObjectId(txId);
  if (!oid) throw new Error('Transaction not found');
  const doc = await Transaction.findById(oid);
  if (!doc) throw new Error('Transaction not found');

  const old = toClient(doc);
  const allowed = ['status', 'fileUrl', 'fileName', 'vendorName', 'description', 'amount'];
  const clean = {};
  allowed.forEach(k => {
    if (updates[k] != null) clean[k] = updates[k];
  });
  if (clean.amount != null) clean.amount = Number(clean.amount);
  clean.updatedAt = new Date();

  Object.assign(doc, clean);
  await doc.save();

  await writeAudit({
    user,
    module: 'Transaction',
    action: 'Update',
    recordId: txId,
    oldValue: old,
    newValue: clean,
  });
  return toClient(doc);
}

async function deleteTransaction(txId, user = {}) {
  const oid = parseObjectId(txId);
  if (!oid) throw new Error('Transaction not found');
  const doc = await Transaction.findById(oid);
  if (!doc) throw new Error('Transaction not found');
  const old = toClient(doc);
  await Transaction.deleteOne({ _id: doc._id });
  await writeAudit({ user, module: 'Transaction', action: 'Delete', recordId: txId, oldValue: old });
  return { success: true };
}

async function getTransactionsForEntity(entityId) {
  const [transactions, pos] = await Promise.all([
    Transaction.find({ entityId }).sort({ createdAt: 1 }),
    PO.find({ entityId }).sort({ createdAt: 1 }),
  ]);
  return {
    transactions: transactions.map(toClient),
    pos: pos.map(toClient),
  };
}

async function computeRollup(entityId) {
  const { transactions, pos } = await getTransactionsForEntity(entityId);

  const nfaList = transactions.filter(t => t.type === 'NFA');
  const invoiceList = transactions.filter(t => t.type === 'INVOICE');
  const paymentList = transactions.filter(t => t.type === 'PAYMENT');

  const totalInvoiced = invoiceList.reduce((s, t) => s + (t.amount || 0), 0);
  const totalPaid = paymentList.reduce((s, t) => s + (t.amount || 0), 0);
  const totalPOValue = pos.reduce((s, p) => s + (p.amount || 0), 0);

  const nfaApproved = nfaList.some(t => t.status === 'Approved');
  const nfaRequired = nfaList.length > 0;

  return {
    nfaCount: nfaList.length,
    nfaApproved,
    nfaRequired,
    poCount: pos.length,
    poValue: totalPOValue,
    invoiceCount: invoiceList.length,
    invoiced: totalInvoiced,
    paymentCount: paymentList.length,
    paid: totalPaid,
    outstanding: totalInvoiced - totalPaid,
  };
}

async function createPO({
  entityId,
  entityType,
  vendorName,
  amount,
  poNumber = '',
  description = '',
  status = 'Draft',
  user = {},
}) {
  if (!entityId) throw new Error('entityId is required');
  if (!vendorName) throw new Error('vendorName is required');
  if (!amount) throw new Error('amount is required');

  const nfaRequired = await getEntityNfaRequired(entityId, entityType);
  const stage = await validateStage({ type: 'PO', entityId, nfaRequired });
  if (!stage.allowed) throw new Error(stage.reason);

  const data = {
    entityId,
    entityType: entityType || 'expense',
    vendorName,
    amount: Number(amount),
    poNumber: poNumber || '',
    description: description || '',
    status,
    invoices: [],
    pdfUrl: null,
    pdfName: null,
    createdAt: new Date(),
    createdBy: user.uid || 'system',
    createdByName: user.name || user.email || 'system',
  };

  const created = await PO.create(data);
  await writeAudit({ user, module: 'PO', action: 'Create', recordId: String(created._id), newValue: data });
  return toClient(created);
}

async function addInvoiceToPO(poId, { vendorName, invoiceNumber = '', amount, tax = 0, date = '' }, user = {}) {
  const pOid = parseObjectId(poId);
  if (!pOid) throw new Error('PO not found');
  const po = await PO.findById(pOid);
  if (!po) throw new Error('PO not found');

  const invoice = {
    id: `inv_${Date.now()}`,
    vendorName: vendorName || '',
    invoiceNumber: invoiceNumber || '',
    amount: Number(amount) || 0,
    tax: Number(tax) || 0,
    date: date || new Date().toISOString().slice(0, 10),
    status: 'Pending',
    createdAt: new Date().toISOString(),
    createdBy: user.uid || 'system',
  };

  po.invoices = [...(po.invoices || []), invoice];
  po.updatedAt = new Date();
  await po.save();

  await createTransaction({
    type: 'INVOICE',
    entityId: po.entityId,
    entityType: po.entityType,
    vendorName: vendorName || '',
    amount: invoice.amount + invoice.tax,
    description: invoiceNumber ? `Invoice #${invoiceNumber}` : 'Invoice',
    status: 'Pending',
    sourceId: poId,
    user,
  });

  await writeAudit({ user, module: 'PO', action: 'Add Invoice', recordId: poId, newValue: invoice });
  return toClient(await PO.findById(pOid));
}

async function buildHierarchy(budgetId) {
  const { ExpenseHead, ExpenseItem, Task } = require('../models');
  const [headSnap, itemSnap, taskSnap] = await Promise.all([
    ExpenseHead.find({ budgetId }).sort({ createdAt: 1 }).lean(),
    ExpenseItem.find({ budgetId }).sort({ createdAt: 1 }).lean(),
    Task.find({ budgetId }).sort({ createdAt: 1 }).lean(),
  ]);

  const toId = d => ({ id: String(d._id), ...d, _id: undefined });
  const heads = headSnap.map(toId);
  const items = itemSnap.map(toId);
  const tasks = taskSnap.map(toId);

  const allEntityIds = [...heads.map(h => h.id), ...items.map(i => i.id), ...tasks.map(t => t.id)];
  const rollups = {};
  await Promise.all(
    allEntityIds.map(async id => {
      rollups[id] = await computeRollup(id);
    })
  );

  const result = heads.map(head => {
    const headItems = items
      .filter(i => i.expenseHeadId === head.id)
      .map(item => {
        const itemTasks = tasks
          .filter(t => t.expenseItemId === item.id)
          .map(task => ({
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

    const directTasks = tasks
      .filter(t => t.expenseHeadId === head.id && !t.expenseItemId)
      .map(task => ({
        ...task,
        ...rollups[task.id],
        level: 'task',
      }));

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
    const totalSpent = (head.spent || 0) + childSpent;

    return {
      ...head,
      ...headRollup,
      level: 'expenseHead',
      allocated: totalAllocated,
      spent: totalSpent,
      remaining: totalAllocated - totalSpent,
      status: totalSpent > totalAllocated ? 'Overrun' : 'Active',
      expenseItems: headItems,
      directTasks,
      expenseItemCount: headItems.length,
      taskCount: headItems.reduce((s, i) => s + i.tasks.length, 0) + directTasks.length,
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
