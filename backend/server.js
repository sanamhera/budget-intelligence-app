require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { connectMongo } = require('./config/mongodb');
const { streamUploadPath } = require('./services/gcs');

const authRoutes = require('./routes/auth');
const budgetRoutes = require('./routes/budget');
const invoiceRoutes = require('./routes/invoice');
const paymentRoutes = require('./routes/payment');
const nfaTrackerRoutes = require('./routes/nfaTracker');
const dashboardRoutes = require('./routes/dashboard');
const auditRoutes = require('./routes/audit');
const expenseHeadRoutes = require('./routes/expenseHeads');
const expenseItemRoutes = require('./routes/expenseItems');
const taskRoutes = require('./routes/tasks');
const vendorRoutes = require('./routes/vendors');
const poRoutes = require('./routes/po');
const transactionRoutes = require('./routes/transactions');
const tagRoutes = require('./routes/tags');
const exportRoutes = require('./routes/export');
const budgetImportRoutes = require('./routes/budgetImport');

const app = express();
app.use(cors({ origin: true }));

// PDFs live in GCS; stream via /uploads/* (no local disk storage)
app.get(/^\/uploads\/.+/, async (req, res) => {
  try {
    await streamUploadPath(req.path, res);
  } catch (e) {
    console.error('[uploads]', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api/gl', require('./routes/gl'));
app.use('/api/auth', authRoutes);
app.use('/api/budgets/import', budgetImportRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/nfa-tracker', nfaTrackerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/expense-heads', expenseHeadRoutes);
app.use('/api/expense-items', expenseItemRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/po', poRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/export', exportRoutes);

app.get('/api/health', (_, res) => res.json({ ok: true }));

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;

connectMongo()
  .then(() => {
    app.listen(PORT, () => console.log(`API running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
