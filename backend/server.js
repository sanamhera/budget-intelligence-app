require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');

const authRoutes      = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const auditRoutes     = require('./routes/audit');

// Budget hierarchy
const budgetRoutes      = require('./routes/budget');         // FY containers
const expenseHeadRoutes = require('./routes/expenseHeads');   // Expense Heads
const expenseItemRoutes = require('./routes/expenseItems');   // Expense Items
const taskRoutes        = require('./routes/tasks');          // Tasks

// Transactions & documents
const transactionRoutes = require('./routes/transactions');
const poRoutes          = require('./routes/po');
const invoiceRoutes     = require('./routes/invoice');
const paymentRoutes     = require('./routes/payment');
const nfaTrackerRoutes  = require('./routes/approval');

// Supporting
const tagRoutes          = require('./routes/tags');
const budgetImportRoutes = require('./routes/budgetImport');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.use('/api/gl',   require('./routes/gl'));
app.use('/api/auth', authRoutes);

// IMPORTANT: import route BEFORE generic budget route
app.use('/api/budgets/import', budgetImportRoutes);
app.use('/api/budgets',        budgetRoutes);

// Hierarchy — new route names
app.use('/api/expense-heads', expenseHeadRoutes);
app.use('/api/expense-items', expenseItemRoutes);
app.use('/api/tasks',         taskRoutes);

// Transactions & documents
app.use('/api/transactions', transactionRoutes);
app.use('/api/pos',          poRoutes);
app.use('/api/invoices',     invoiceRoutes);
app.use('/api/payments',     paymentRoutes);
app.use('/api/nfa-tracker',  nfaTrackerRoutes);

// Supporting
app.use('/api/tags',      tagRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit',     auditRoutes);

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