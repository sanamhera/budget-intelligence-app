const mongoose = require('mongoose');

const vendorGlSchema = new mongoose.Schema(
  {
    vendorName: { type: String, index: true },
    glCode: String,
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'vendorGL' }
);

module.exports = mongoose.model('VendorGlMemory', vendorGlSchema);
