const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, index: true },
    budgetId: String,
    vendorId: String,
    vendorName: String,
    invoiceNumber: String,
    amount: Number,
    note: String,
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: Date,
    createdBy: String,
  },
  { strict: false, collection: 'payments' }
);

module.exports = mongoose.model('Payment', paymentSchema);
