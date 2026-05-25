const { VendorGlMemory } = require('../models');

async function getVendorGL(vendorName) {
  if (!vendorName) return null;
  const row = await VendorGlMemory.findOne({ vendorName }).lean();
  return row ? row.glCode : null;
}

async function saveVendorGL(vendorName, glCode) {
  if (!vendorName || !glCode) return;
  await VendorGlMemory.findOneAndUpdate(
    { vendorName },
    { vendorName, glCode, updatedAt: new Date() },
    { upsert: true, new: true }
  );
}

module.exports = {
  getVendorGL,
  saveVendorGL,
};
