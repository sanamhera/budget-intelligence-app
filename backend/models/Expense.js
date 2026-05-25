const mongoose = require('mongoose');

/** Legacy hierarchy collection used by transactionService / budget delete checks */
const expenseSchema = new mongoose.Schema(
  {
    budgetId: { type: String, index: true },
    nfaRequired: { type: String, default: 'no' },
    createdAt: { type: Date, default: Date.now },
  },
  { strict: false, collection: 'expenses' }
);

module.exports = mongoose.model('Expense', expenseSchema);
