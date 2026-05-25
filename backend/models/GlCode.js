const mongoose = require('mongoose');

const glCodeSchema = new mongoose.Schema(
  {
    code: String,
    name: String,
    active: { type: Boolean, default: true, index: true },
  },
  { strict: false, collection: 'glCodes' }
);

module.exports = mongoose.model('GlCode', glCodeSchema);
