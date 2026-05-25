const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    nameLower: { type: String, index: true },
    color: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date,
    createdBy: String,
  },
  { collection: 'tags' }
);

module.exports = mongoose.model('Tag', tagSchema);
