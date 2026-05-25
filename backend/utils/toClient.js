const mongoose = require('mongoose');

/** Convert Mongoose doc or plain object to API shape { id, ...fields } */
function toClient(doc) {
  if (doc == null) return null;
  const plain = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc };
  if (plain._id != null) {
    plain.id = String(plain._id);
    delete plain._id;
  }
  if (plain.__v !== undefined) delete plain.__v;
  return plain;
}

function toClientList(docs) {
  return (docs || []).map(toClient);
}

function parseObjectId(id) {
  if (id == null || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return new mongoose.Types.ObjectId(String(id));
}

module.exports = { toClient, toClientList, parseObjectId };
