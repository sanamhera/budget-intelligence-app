const { db } = require('../config/firebase');

/* =========================
   GET GL FROM VENDOR MEMORY
========================= */
async function getVendorGL(vendorName) {

  const snap = await db
    .collection('vendorGL')
    .where('vendorName', '==', vendorName)
    .limit(1)
    .get();

  if (snap.empty) return null;

  return snap.docs[0].data().glCode;
}


/* =========================
   SAVE VENDOR GL LEARNING
========================= */
async function saveVendorGL(vendorName, glCode) {

  if (!vendorName || !glCode) return;

  const snap = await db
    .collection('vendorGL')
    .where('vendorName', '==', vendorName)
    .limit(1)
    .get();

  if (snap.empty) {

    await db.collection('vendorGL').add({
      vendorName,
      glCode,
      updatedAt: new Date()
    });

  } else {

    await snap.docs[0].ref.update({
      glCode,
      updatedAt: new Date()
    });

  }

}

module.exports = {
  getVendorGL,
  saveVendorGL
};