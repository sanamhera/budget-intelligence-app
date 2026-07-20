/**
 * Google Cloud Storage helpers for PDF persistence.
 * Objects are private; the app serves them via /uploads/* proxy.
 */
const { Storage } = require('@google-cloud/storage');
const path = require('path');

const storage = new Storage();

function getBucketName() {
  const name = process.env.GCS_BUCKET;
  if (!name || !String(name).trim()) {
    throw new Error('GCS_BUCKET must be set');
  }
  return String(name).trim();
}

function sanitizeFileName(originalName) {
  const base = path.basename(String(originalName || 'document.pdf'));
  return `${Date.now()}_${base.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')}`;
}

/**
 * Upload a PDF buffer under a folder (e.g. nfa-pdfs, po-pdfs, invoice-pdfs).
 * Returns a stable app URL path: /uploads/<folder>/<filename>
 */
async function uploadPdf(folder, buffer, originalName, contentType = 'application/pdf') {
  const bucketName = getBucketName();
  const safe = sanitizeFileName(originalName);
  const objectPath = `${folder}/${safe}`;
  const file = storage.bucket(bucketName).file(objectPath);
  await file.save(buffer, {
    contentType: contentType || 'application/pdf',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=3600',
    },
  });
  return `/uploads/${objectPath}`;
}

/**
 * Stream a GCS object to an Express response for /uploads/<folder>/<file>
 */
async function streamUploadPath(reqPath, res) {
  const bucketName = getBucketName();
  // reqPath like /uploads/nfa-pdfs/foo.pdf
  const relative = String(reqPath || '').replace(/^\/uploads\/?/, '');
  if (!relative || relative.includes('..')) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  const file = storage.bucket(bucketName).file(relative);
  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const [metadata] = await file.getMetadata();
  res.setHeader('Content-Type', metadata.contentType || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(relative)}"`);
  if (metadata.size) res.setHeader('Content-Length', metadata.size);
  file.createReadStream()
    .on('error', (err) => {
      console.error('[GCS stream]', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to read file' });
      else res.end();
    })
    .pipe(res);
}

module.exports = { uploadPdf, streamUploadPath, getBucketName, sanitizeFileName };
