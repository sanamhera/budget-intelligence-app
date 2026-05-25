const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, index: true },
    entityId: { type: String, index: true },
    entityType: String,
    vendorName: String,
    amount: Number,
    description: String,
    fileUrl: String,
    fileName: String,
    status: String,
    sourceId: { type: String, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: Date,
    createdBy: String,
    createdByName: String,
  },
  { strict: false, collection: 'transactions' }
);

transactionSchema.index({ sourceId: 1, type: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
