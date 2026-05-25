const mongoose = require('mongoose');

const subExpenseSchema = new mongoose.Schema(
  {
    budgetId: { type: String, index: true },
    nfaRequired: { type: String, default: 'no' },
    createdAt: { type: Date, default: Date.now },
  },
  { strict: false, collection: 'subExpenses' }
);

module.exports = mongoose.model('SubExpense', subExpenseSchema);
