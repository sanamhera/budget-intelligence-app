const mongoose = require('mongoose');

const expenseHeadSchema = new mongoose.Schema(
  {
    budgetId: { type: String, index: true },
    name: String,
    allocated: Number,
    spent: Number,
    remaining: Number,
    status: String,
    function: String,
    budgetType: String,
    opexAmount: Number,
    capexAmount: Number,
    category: String,
    spendCategory: String,
    investmentType: String,
    nfaRequired: String,
    description: String,
    tagIds: { type: [String], default: [] },
    fy: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    createdBy: String,
    createdByName: String,
  },
  { strict: false, collection: 'expenseHeads' }
);

module.exports = mongoose.model('ExpenseHead', expenseHeadSchema);
