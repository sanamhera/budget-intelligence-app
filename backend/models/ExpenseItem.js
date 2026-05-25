const mongoose = require('mongoose');

const expenseItemSchema = new mongoose.Schema(
  {
    budgetId: String,
    expenseHeadId: { type: String, index: true },
    name: String,
    allocated: Number,
    spent: Number,
    remaining: Number,
    status: String,
    nfaRequired: String,
    description: String,
    function: String,
    budgetType: String,
    category: String,
    spendCategory: String,
    investmentType: String,
    tagIds: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    createdBy: String,
    createdByName: String,
  },
  { strict: false, collection: 'expenseItems' }
);

module.exports = mongoose.model('ExpenseItem', expenseItemSchema);
