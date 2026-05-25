const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    budgetId: String,
    vendorName: String,
    vendorId: String,
    amount: Number,
    tax: { type: Number, default: 0 },
    invoiceNumber: String,
    date: String,
    dueDate: String,
    glCode: String,
    costCentre: String,
    status: String,
    paidAmount: { type: Number, default: 0 },
    expenseHeadId: String,
    expenseItemId: String,
    taskId: String,
    nfaId: String,
    nfaNumber: String,
    poId: String,
    poNumber: String,
    lineItems: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    createdBy: String,
  },
  { strict: false, collection: 'invoices' }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
