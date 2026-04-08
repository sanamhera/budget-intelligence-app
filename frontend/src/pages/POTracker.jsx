import { useState, useEffect, useRef } from 'react';
import {
  Box, Button, Card, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Chip, CircularProgress, MenuItem, Select, InputLabel,
  FormControl, Collapse, IconButton, InputAdornment, Tooltip,
  Divider, Alert,
} from '@mui/material';
import AddIcon               from '@mui/icons-material/Add';
import SearchIcon            from '@mui/icons-material/Search';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon   from '@mui/icons-material/KeyboardArrowUp';
import UploadFileIcon        from '@mui/icons-material/UploadFile';
import DownloadIcon          from '@mui/icons-material/Download';
import { useAuth } from '../context/AuthContext';

const fmt = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;

/* ── Status chip ─────────────────────────────────────────────── */
function POStatusChip({ status }) {
  const map = {
    open:      { label: 'Open',      bgcolor: '#D1FAE5', color: '#065F46', border: '#6EE7B7' },
    closed:    { label: 'Closed',    bgcolor: '#F1F5F9', color: '#475569', border: '#CBD5E1' },
    cancelled: { label: 'Cancelled', bgcolor: '#FEE2E2', color: '#991B1B', border: '#FCA5A5' },
    partial:   { label: 'Partial',   bgcolor: '#FEF3C7', color: '#92400E', border: '#FCD34D' },
  };
  const s = map[status] || map.open;
  return <Chip label={s.label} size="small"
    sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: s.bgcolor, color: s.color,
      border: `1px solid ${s.border}`, '& .MuiChip-label': { px: 1.2 } }} />;
}

/* ── Invoice row inside expanded PO ─────────────────────────── */
function InvoiceRow({ inv }) {
  return (
    <Box display="flex" alignItems="center" gap={1.5} py={0.6}
      sx={{ borderBottom: '1px dashed #E2E8F0', '&:last-child': { borderBottom: 'none' } }}>
      <Box flex={1}>
        <Typography variant="caption" fontWeight={700}>{inv.invoiceNumber || 'Invoice'}</Typography>
        {inv.vendor && <Typography variant="caption" color="text.secondary"> — {inv.vendor}</Typography>}
      </Box>
      <Typography variant="caption" color="text.secondary">{inv.date || '—'}</Typography>
      <Typography variant="caption" fontWeight={700} color="warning.dark" sx={{ minWidth: 80, textAlign: 'right' }}>
        {fmt(inv.amount || 0)}
      </Typography>
      <Chip label={inv.paid ? 'Paid' : 'Unpaid'} size="small"
        sx={{ height: 18, fontSize: 10, fontWeight: 700,
          bgcolor: inv.paid ? '#D1FAE5' : '#FEF3C7',
          color: inv.paid ? '#065F46' : '#92400E' }} />
    </Box>
  );
}

/* ── PO row with expand for invoices ─────────────────────────── */
function PORow({ po, projectName, canEdit, onAddInvoice }) {
  const [open, setOpen] = useState(false);
  const invoices = po.invoices || [];
  const invoicedTotal = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const paidTotal     = invoices.filter(i => i.paid).reduce((s, i) => s + (Number(i.amount) || 0), 0);

  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: 'unset' }, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        <TableCell padding="checkbox">
          <IconButton size="small">{open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}</IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontFamily="monospace" fontWeight={700} color="warning.dark">
            {po.poNumber || po.id}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={600}>{projectName(po.projectId)}</Typography>
        </TableCell>
        <TableCell><Typography variant="body2">{po.vendor || '—'}</Typography></TableCell>
        <TableCell align="right">
          <Typography variant="body2" fontWeight={700}>{fmt(po.amount || 0)}</Typography>
        </TableCell>
        <TableCell align="right">
          <Tooltip title="Total invoiced against this PO">
            <Typography variant="body2" color="warning.main" fontWeight={600}>{fmt(invoicedTotal)}</Typography>
          </Tooltip>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" color="success.main" fontWeight={600}>{fmt(paidTotal)}</Typography>
        </TableCell>
        <TableCell><Typography variant="caption">{po.date || '—'}</Typography></TableCell>
        <TableCell><POStatusChip status={po.status} /></TableCell>
        <TableCell>
          {po.pdfUrl
            ? <Button size="small" startIcon={<DownloadIcon />} href={po.pdfUrl} target="_blank"
                sx={{ fontSize: 11, textTransform: 'none' }}>Download PO</Button>
            : <Typography variant="caption" color="text.disabled">No PDF uploaded</Typography>}
        </TableCell>
        <TableCell>
          <Typography variant="caption" sx={{
            display: 'inline-block', bgcolor: '#EEF2FF', color: '#4338CA',
            borderRadius: 1, px: 0.8, fontWeight: 700, fontSize: 10,
          }}>
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
          </Typography>
        </TableCell>
      </TableRow>

      {/* Expanded: invoices */}
      <TableRow>
        <TableCell colSpan={11} sx={{ py: 0, background: '#FAFBFF' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="caption" fontWeight={700} color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Invoices against {po.poNumber || po.id}
                </Typography>
                {canEdit && (
                  <Button size="small" startIcon={<AddIcon />}
                    onClick={e => { e.stopPropagation(); onAddInvoice(po); }}
                    sx={{ fontSize: 11 }}>
                    Add Invoice
                  </Button>
                )}
              </Box>
              {invoices.length === 0
                ? <Typography variant="caption" color="text.disabled">No invoices yet.</Typography>
                : invoices.map((inv, i) => <InvoiceRow key={i} inv={inv} />)
              }
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════ */
export default function POTracker() {
  const [list,     setList]    = useState([]);
  const [budgets,  setBudgets] = useState([]);
  const [loading,  setLoading] = useState(true);
  const [search,   setSearch]  = useState('');
  const [open,     setOpen]    = useState(false);
  const [invOpen,  setInvOpen] = useState(false);
  const [targetPO, setTargetPO]= useState(null);
  const fileRef = useRef(null);

  /* PO form */
  const [projectId, setProjectId] = useState('');
  const [vendor,    setVendor]    = useState('');
  const [poNumber,  setPoNumber]  = useState('');
  const [amount,    setAmount]    = useState('');
  const [date,      setDate]      = useState('');
  const [status,    setStatus]    = useState('open');
  const [pdfFile,   setPdfFile]   = useState(null);
  const [pdfUrl,    setPdfUrl]    = useState('');
  const [uploading, setUploading] = useState(false);

  /* Invoice form */
  const [invNumber, setInvNumber] = useState('');
  const [invVendor, setInvVendor] = useState('');
  const [invAmount, setInvAmount] = useState('');
  const [invDate,   setInvDate]   = useState('');
  const [invPaid,   setInvPaid]   = useState(false);
  const [costCentre,setCostCentre]= useState('');

  const { user } = useAuth();
  const canEdit = ['Admin', 'Finance'].includes(user?.role);

  const load = async () => {
    const token = localStorage.getItem('token') || '';
    const h = { Authorization: `Bearer ${token}` };
    try { const r = await fetch('/api/pos', { headers: h }); if (r.ok) setList(await r.json()); } catch {}
    try { const r = await fetch('/api/budgets', { headers: h }); if (r.ok) setBudgets(await r.json()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Revoke any blob URLs on unmount to avoid memory leaks
  const blobUrlsRef = useRef([]);
  useEffect(() => {
    return () => { blobUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} }); };
  }, []);

  const projectName = id => budgets.find(b => b.id === id)?.name || id;

  const resetPO = () => {
    setProjectId(''); setVendor(''); setPoNumber(''); setAmount('');
    setDate(''); setStatus('open'); setPdfFile(null); setPdfUrl('');
  };

  const handlePdfUpload = async (file) => {
    if (!file) return '';
    setUploading(true);
    // Upload to /api/po/upload — falls back to object URL if backend not ready
    const token = localStorage.getItem('token') || '';
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/api/po/upload', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      if (r.ok) { const d = await r.json(); setUploading(false); return d.url || ''; }
    } catch {}
    setUploading(false);
    // Don't use blob URLs — they die on refresh. Store null so user knows upload failed.
    console.warn('PO upload endpoint unavailable — PDF not stored');
    return '';
  };

  const handleCreatePO = async () => {
    if (!projectId || !amount) return;
    let url = pdfUrl;
    if (pdfFile) url = await handlePdfUpload(pdfFile);
    const token = localStorage.getItem('token') || '';
    const item = {
      projectId, vendor, poNumber, amount: parseFloat(amount) || 0,
      date, status, pdfUrl: url, invoices: [], createdAt: new Date().toISOString(),
    };
    try {
      const r = await fetch('/api/pos', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(item),
      });
      if (r.ok) { const saved = await r.json(); setList(p => [...p, saved]); }
      else setList(p => [...p, { ...item, id: Date.now().toString() }]);
    } catch { setList(p => [...p, { ...item, id: Date.now().toString() }]); }
    setOpen(false); resetPO();
  };

  const handleAddInvoice = (po) => { setTargetPO(po); setInvOpen(true); };

  const handleSaveInvoice = async () => {
    if (!targetPO) return;
    const inv = {
      id: Date.now().toString(), invoiceNumber: invNumber, vendor: invVendor,
      amount: parseFloat(invAmount) || 0, date: invDate, paid: invPaid, costCentre,
    };
    const updated = { ...targetPO, invoices: [...(targetPO.invoices || []), inv] };
    const token = localStorage.getItem('token') || '';
    try {
      await fetch('/api/pos/' + targetPO.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invoices: updated.invoices }),
      });
    } catch {}
    setList(prev => prev.map(p => p.id === targetPO.id ? updated : p));
    setInvOpen(false);
    setInvNumber(''); setInvVendor(''); setInvAmount(''); setInvDate(''); setInvPaid(false); setCostCentre('');
  };

  const filtered = list.filter(p => {
    const q = search.toLowerCase();
    return !q
      || (p.vendor || '').toLowerCase().includes(q)
      || (p.poNumber || '').toLowerCase().includes(q)
      || projectName(p.projectId).toLowerCase().includes(q);
  });

  const totalCommitted = filtered.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalInvoiced  = filtered.reduce((s, p) =>
    s + (p.invoices || []).reduce((si, i) => si + (Number(i.amount) || 0), 0), 0);
  const totalPaid      = filtered.reduce((s, p) =>
    s + (p.invoices || []).filter(i => i.paid).reduce((si, i) => si + (Number(i.amount) || 0), 0), 0);

  if (loading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h5">PO Tracker</Typography>
        {canEdit && (
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
            Add PO
          </Button>
        )}
      </Box>

      {/* Search */}
      <Box mb={2}>
        <TextField size="small" placeholder="Search by PO number, vendor, project…"
          value={search} onChange={e => setSearch(e.target.value)} sx={{ width: 360 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
      </Box>

      {/* Summary */}
      <Box display="flex" gap={1.5} mb={2} flexWrap="wrap">
        {[
          { label: 'Total POs', value: filtered.length, color: '#F97316' },
          { label: 'Open', value: filtered.filter(p => p.status === 'open').length, color: '#10B981' },
          { label: 'PO Value', value: fmt(totalCommitted), color: '#F97316' },
          { label: 'Invoiced', value: fmt(totalInvoiced), color: '#F59E0B' },
          { label: 'Paid', value: fmt(totalPaid), color: '#10B981' },
        ].map((s, i) => (
          <Box key={i} sx={{ bgcolor: '#fff', border: '1px solid #E2E8F0', borderRadius: 2, px: 2, py: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block"
              sx={{ textTransform: 'uppercase', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em' }}>{s.label}</Typography>
            <Typography fontWeight={800} fontSize={17} color={s.color}>{s.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* Table */}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>PO Number</TableCell>
              <TableCell>Project</TableCell>
              <TableCell>Vendor</TableCell>
              <TableCell align="right">PO Amount</TableCell>
              <TableCell align="right">Invoiced</TableCell>
              <TableCell align="right">Paid</TableCell>
              <TableCell>PO Date</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>PO PDF</TableCell>
              <TableCell>Invoices</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No POs found. Click "Add PO" to create one.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((po, i) => (
              <PORow key={i} po={po} projectName={projectName} canEdit={canEdit}
                onAddInvoice={handleAddInvoice} />
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* ── Add PO dialog ── */}
      <Dialog open={open} onClose={() => { setOpen(false); resetPO(); }} maxWidth="sm" fullWidth>
        <DialogTitle>Add Purchase Order</DialogTitle>
        <DialogContent>
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5} mt={0.5}>
            <FormControl fullWidth size="small" sx={{ gridColumn: '1 / -1' }}>
              <InputLabel>Project *</InputLabel>
              <Select value={projectId} label="Project *" onChange={e => setProjectId(e.target.value)}>
                <MenuItem value=""><em>Select project…</em></MenuItem>
                {budgets.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
              </Select>
            </FormControl>

            <TextField size="small" label="PO Number" value={poNumber}
              onChange={e => setPoNumber(e.target.value)} placeholder="e.g. PO/2025/001" />
            <TextField size="small" label="Vendor" value={vendor}
              onChange={e => setVendor(e.target.value)} />

            <TextField size="small" type="number" label="PO Amount (₹) *" value={amount}
              onChange={e => setAmount(e.target.value)} />
            <TextField size="small" type="date" label="PO Date" value={date}
              onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />

            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={status} label="Status" onChange={e => setStatus(e.target.value)}>
                <MenuItem value="open">Open</MenuItem>
                <MenuItem value="partial">Partial</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>

            {/* PDF upload */}
            <Box sx={{ gridColumn: '1 / -1' }}>
              <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }}
                onChange={e => setPdfFile(e.target.files[0] || null)} />
              <Button startIcon={<UploadFileIcon />} variant="outlined" size="small"
                onClick={() => fileRef.current?.click()}>
                {pdfFile ? pdfFile.name : 'Upload PO PDF'}
              </Button>
              {pdfFile && <Typography variant="caption" color="success.main" ml={1}>Ready to upload</Typography>}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); resetPO(); }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreatePO}
            disabled={!projectId || !amount || uploading}>
            {uploading ? 'Uploading…' : 'Save PO'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Add Invoice dialog ── */}
      <Dialog open={invOpen} onClose={() => setInvOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Invoice — {targetPO?.poNumber || targetPO?.id}</DialogTitle>
        <DialogContent>
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5} mt={0.5}>
            <TextField size="small" label="Invoice Number" value={invNumber}
              onChange={e => setInvNumber(e.target.value)} />
            <TextField size="small" label="Vendor" value={invVendor}
              onChange={e => setInvVendor(e.target.value)} />
            <TextField size="small" type="number" label="Invoice Amount (₹)" value={invAmount}
              onChange={e => setInvAmount(e.target.value)} />
            <TextField size="small" type="date" label="Invoice Date" value={invDate}
              onChange={e => setInvDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField size="small" label="Cost Centre" value={costCentre}
              onChange={e => setCostCentre(e.target.value)} placeholder="Optional" />
            <FormControl fullWidth size="small">
              <InputLabel>Payment Status</InputLabel>
              <Select value={invPaid} label="Payment Status" onChange={e => setInvPaid(e.target.value)}>
                <MenuItem value={false}>Unpaid</MenuItem>
                <MenuItem value={true}>Paid</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveInvoice}>Add Invoice</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}