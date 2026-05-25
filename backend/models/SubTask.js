const mongoose = require('mongoose');

const subTaskSchema = new mongoose.Schema(
  {
    budgetId: { type: String, index: true },
    nfaRequired: { type: String, default: 'no' },
    createdAt: { type: Date, default: Date.now },
  },
  { strict: false, collection: 'subTasks' }
);

module.exports = mongoose.model('SubTask', subTaskSchema);
