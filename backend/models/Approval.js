const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema(
  {
    expenseHeadId: { type: String, index: true },
    expenseItemId: String,
    taskId: String,
    nfaNumber: String,
    title: String,
    description: String,
    amount: Number,
    status: { type: String, index: true },
    nfaRaised: Boolean,
    nfaApproved: Boolean,
    approvedAmount: Number,
    pdfUrl: String,
    pdfName: String,
    comments: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    submittedAt: Date,
    createdBy: String,
    createdByName: String,
    linkedProjectId: String,
    projectId: String,
  },
  { strict: false, collection: 'approvals' }
);

module.exports = mongoose.model('Approval', approvalSchema);
