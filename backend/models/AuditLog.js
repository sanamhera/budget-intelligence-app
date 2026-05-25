const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user: String,
    module: String,
    action: String,
    recordId: { type: String, default: null },
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
    createdBy: { type: String, default: null },
  },
  { collection: 'audit' }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
