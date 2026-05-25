const mongoose = require('mongoose');

const poSchema = new mongoose.Schema(
  {
    entityId: { type: String, index: true },
    entityType: String,
    nfaId: { type: String, index: true },
    vendorName: String,
    amount: Number,
    poNumber: String,
    description: String,
    status: String,
    invoices: { type: Array, default: [] },
    pdfUrl: String,
    pdfName: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    createdBy: String,
    createdByName: String,
  },
  { strict: false, collection: 'pos' }
);

module.exports = mongoose.model('PO', poSchema);
