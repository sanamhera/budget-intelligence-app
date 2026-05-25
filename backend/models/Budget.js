const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
  {
    fy: String,
    name: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    createdBy: String,
    isDefault: { type: Boolean, default: false },
    spent: { type: Number, default: 0 },
    allocated: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
    status: String,
    parentProjectId: String,
    businessUnit: String,
    budgetType: String,
    category: String,
    spendCategory: String,
    investmentType: String,
    spendClass: String,
    taskName: String,
    nfaRequired: String,
    nfaRaised: Number,
    nfaApproved: Number,
    linkedProjectId: String,
    projectId: String,
  },
  { strict: false, collection: 'budgets' }
);

module.exports = mongoose.model('Budget', budgetSchema);
