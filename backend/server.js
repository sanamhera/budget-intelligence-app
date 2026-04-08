require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const authRoutes     = require('./routes/auth');
const budgetRoutes   = require('./routes/budget');
const invoiceRoutes  = require('./routes/invoice');
const paymentRoutes  = require('./routes/payment');
const nfaTrackerRoutes = require('./routes/approval');  // file stays approval.js
const dashboardRoutes = require('./routes/dashboard');
const auditRoutes    = require('./routes/audit');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use('/api/gl', require('./routes/gl'));

app.use('/api/auth',        authRoutes);
app.use('/api/budgets',     budgetRoutes);
app.use('/api/invoices',    invoiceRoutes);
app.use('/api/payments',    paymentRoutes);
app.use('/api/nfa-tracker', nfaTrackerRoutes);  // was /api/approvals
app.use('/api/dashboard',   dashboardRoutes);
app.use('/api/audit',       auditRoutes);

app.get('/api/health', (_, res) => res.json({ ok: true }));

const publicDir = path.join(__dirname, 'public');
if (require('fs').existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));