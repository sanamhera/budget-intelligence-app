const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
  {
    name: String,
    nameLower: { type: String, index: true },
    vendorCode: { type: String, index: true },
    gstNumber: String,
    address: String,
    contactPerson: String,
    email: String,
    phone: String,
    category: String,
    contractType: String,
    services: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    createdBy: String,
    source: String,
  },
  { strict: false, collection: 'vendors' }
);

module.exports = mongoose.model('Vendor', vendorSchema);
