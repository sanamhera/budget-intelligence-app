const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    budgetId: String,
    expenseHeadId: { type: String, index: true },
    expenseItemId: { type: String, index: true },
    name: String,
    allocated: Number,
    spent: Number,
    remaining: Number,
    status: String,
    nfaRequired: String,
    description: String,
    tagIds: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    createdBy: String,
    createdByName: String,
  },
  { strict: false, collection: 'tasks' }
);

module.exports = mongoose.model('Task', taskSchema);
