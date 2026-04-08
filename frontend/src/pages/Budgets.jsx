import { useState, useEffect } from 'react';
import {
  Box, Button, Card, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Chip, CircularProgress, MenuItem, Select, InputLabel,
  FormControl, LinearProgress, Tooltip, Collapse, IconButton,
  Divider,
} from '@mui/material';
import AddIcon              from '@mui/icons-material/Add';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon   from '@mui/icons-material/KeyboardArrowUp';
import EditIcon             from '@mui/icons-material/Edit';
import DeleteIcon           from '@mui/icons-material/Delete';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

/* ── helpers ─────────────────────────────────────────────────── */
const fmt = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const pct = (a, b) => (b ? Math.min(100, (a / b) * 100) : 0);

const FN_OPTIONS  = ['Finance','IT','Operations','HR','Legal','Marketing','Supply Chain','Engineering'];
const CAT_OPTIONS = ['Application','Infrastructure','Data','Security','Compliance','Operations'];
const SPEND_CAT   = ['Run','Change'];
const INV_TYPE    = ['Maintenance','Enhancement','New Development'];
const BUDGET_TYPE = ['Capex','Opex'];

/* ── NFA Required chip ──────────────────────────────────────── */
function NFARequiredChip({ value }) {
  const yes = value === true || value === 'yes';
  const no  = value === false || value === 'no';
  if (!yes && !no) return <Chip label="N/A" size="small" sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: '#F1F5F9', color: '#64748B' }} />;
  return (
    <Chip label={yes ? 'Required' : 'Not Required'} size="small"
      sx={{ height: 22, fontSize: 11, fontWeight: 700,
        bgcolor: yes ? '#EDE9FE' : '#F0FDF4',
        color:   yes ? '#5B21B6' : '#065F46',
        border:  `1px solid ${yes ? '#C4B5FD' : '#6EE7B7'}`,
        '& .MuiChip-label': { px: 1.2 },
      }} />
  );
}

/* ── NFA Approved chip ──────────────────────────────────────── */
function NFAApprovedChip({ value }) {
  const v = (value || '').toString().toLowerCase();
  let label = 'Not Approved', bgcolor = '#FEE2E2', color = '#991B1B', border = '#FCA5A5';
  if (v === 'approved' || v === 'yes') {
    label = 'Approved'; bgcolor = '#D1FAE5'; color = '#065F46'; border = '#6EE7B7';
  }
  return (
    <Chip label={label} size="small"
      sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor, color,
        border: `1px solid ${border}`, '& .MuiChip-label': { px: 1.2 } }} />
  );
}

/* ── Sub-task row (inline edit/delete) ───────────────────────── */
function SubTaskRow({ sub, onEdit, onDelete, canEdit }) {
  return (
    <Box display="flex" alignItems="center" gap={1} py={0.5}
      sx={{ borderBottom: '1px dashed #E2E8F0', '&:last-child': { borderBottom: 'none' } }}>
      <Box flex={1}>
        <Typography variant="caption" fontWeight={600} color="text.primary">{sub.name}</Typography>
        {sub.description && <Typography variant="caption" color="text.secondary" display="block">{sub.description}</Typography>}
      </Box>
      <Typography variant="caption" fontWeight={700} color="primary.main" sx={{ minWidth: 70, textAlign: 'right' }}>
        {fmt(sub.allocated || 0)}
      </Typography>
      {canEdit && (
        <Box display="flex" gap={0.5}>
          <IconButton size="small" onClick={() => onEdit(sub)} sx={{ color: '#64748B' }}><EditIcon sx={{ fontSize: 15 }} /></IconButton>
          <IconButton size="small" onClick={() => onDelete(sub.id)} sx={{ color: '#EF4444' }}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton>
        </Box>
      )}
    </Box>
  );
}

/* ── Expandable project row ──────────────────────────────────── */
function ProjectRow({ b, canEdit, onSubTaskSaved, onSubTaskDeleted }) {
  const [open, setOpen] = useState(false);
  const [subDialog, setSubDialog] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [subName, setSubName] = useState('');
  const [subAllocated, setSubAllocated] = useState('');
  const [subDesc, setSubDesc] = useState('');

  const spent     = Number(b.spent || 0);
  const allocated = Number(b.allocated || 0);
  const remaining = Number(b.remaining ?? allocated - spent);
  const utilPct   = pct(spent, allocated);
  const isOverrun = spent > allocated;
  const subTasks  = b.subTasks || [];

  const nfaRequired = b.nfaRequired ?? b.nfaRaisedStatus;
  const nfaApproved = b.nfaApprovalStatus ?? b.nfaApprovedStatus ?? '';

  const pipeline = [
    { label: 'Budget Approved', value: allocated,                    color: '#4F6EF7' },
    { label: 'NFA Approved',    value: Number(b.nfaApproved || 0),   color: '#8B5CF6' },
    { label: 'PO Raised',       value: Number(b.poRaised    || 0),   color: '#F97316' },
    { label: 'Invoiced',        value: Number(b.invoiced || spent),  color: '#F59E0B' },
    { label: 'Paid',            value: Number(b.paid        || 0),   color: '#10B981' },
  ];

  const openAddSub = () => {
    setEditingSub(null); setSubName(''); setSubAllocated(''); setSubDesc('');
    setSubDialog(true);
  };
  const openEditSub = (sub) => {
    setEditingSub(sub); setSubName(sub.name || ''); setSubAllocated(sub.allocated || ''); setSubDesc(sub.description || '');
    setSubDialog(true);
  };
  const saveSub = async () => {
    if (!subName.trim()) return;
    const token = localStorage.getItem('token') || '';
    const subData = { name: subName, allocated: parseFloat(subAllocated) || 0, description: subDesc };
    if (editingSub) {
      // PATCH /api/budgets/:id/subtasks/:subId
      try {
        await fetch(`/api/budgets/${b.id}/subtasks/${editingSub.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify(subData),
        });
      } catch {}
      onSubTaskSaved(b.id, { ...editingSub, ...subData });
    } else {
      const newSub = { ...subData, id: Date.now().toString() };
      // POST /api/budgets/:id/subtasks
      try {
        const r = await fetch(`/api/budgets/${b.id}/subtasks`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify(newSub),
        });
        if (r.ok) { const saved = await r.json(); onSubTaskSaved(b.id, saved); setSubDialog(false); return; }
      } catch {}
      onSubTaskSaved(b.id, newSub);
    }
    setSubDialog(false);
  };
  const deleteSub = async (subId) => {
    const token = localStorage.getItem('token') || '';
    try {
      await fetch(`/api/budgets/${b.id}/subtasks/${subId}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + token },
      });
    } catch {}
    onSubTaskDeleted(b.id, subId);
  };

  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: 'unset' }, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        <TableCell padding="checkbox">
          <IconButton size="small">{open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}</IconButton>
        </TableCell>

        <TableCell>
          <Typography variant="body2" fontWeight={600}>{b.name}</Typography>
          {b.function && <Typography variant="caption" color="text.secondary">{b.function}</Typography>}
          {subTasks.length > 0 && (
            <Chip label={`${subTasks.length} sub-task${subTasks.length > 1 ? 's' : ''}`}
              size="small" sx={{ ml: 0.5, height: 16, fontSize: 10, bgcolor: '#EEF2FF', color: '#4338CA' }} />
          )}
        </TableCell>

        <TableCell>
          {b.budgetType && <Chip label={b.budgetType} size="small"
            color={b.budgetType === 'Capex' ? 'secondary' : 'primary'} variant="outlined" />}
        </TableCell>

        <TableCell align="right">{fmt(allocated)}</TableCell>

        <TableCell align="right">
          <Box>
            <Typography variant="body2">{fmt(spent)}</Typography>
            <Tooltip title={`${utilPct.toFixed(1)}% utilised`}>
              <LinearProgress variant="determinate" value={utilPct}
                color={isOverrun ? 'error' : utilPct > 85 ? 'warning' : 'primary'}
                sx={{ height: 4, borderRadius: 2, mt: 0.5, width: 80 }} />
            </Tooltip>
          </Box>
        </TableCell>

        <TableCell align="right"
          sx={{ color: remaining < 0 ? 'error.main' : 'success.main', fontWeight: 600 }}>
          {remaining < 0 ? `-${fmt(Math.abs(remaining))}` : fmt(remaining)}
        </TableCell>

        <TableCell align="center"><NFARequiredChip value={nfaRequired} /></TableCell>
        <TableCell align="center"><NFAApprovedChip value={nfaApproved} /></TableCell>

        <TableCell>
          <Chip label={b.status || (isOverrun ? 'Overrun' : 'Active')} size="small"
            color={(b.status === 'Overrun' || isOverrun) ? 'error' : b.status === 'Closed' ? 'default' : 'success'} />
        </TableCell>
      </TableRow>

      {/* ── Expandable panel ── */}
      <TableRow>
        <TableCell colSpan={9} sx={{ py: 0, background: '#FAFBFF' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2, display: 'flex', gap: 3, flexWrap: 'wrap' }}>

              {/* Pipeline bars */}
              <Box flex="1" minWidth={280}>
                <Typography variant="caption" fontWeight={700} color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }} display="block" mb={1.5}>
                  Budget Pipeline
                </Typography>
                {pipeline.map((s, i) => (
                  <Box key={i} display="flex" alignItems="center" gap={1.5} mb={1}>
                    <Typography variant="caption" color="text.secondary"
                      sx={{ width: 115, textAlign: 'right', flexShrink: 0 }}>{s.label}</Typography>
                    <Box flex={1} height={14} bgcolor="#E8ECF4" borderRadius={1} overflow="hidden">
                      <Box height="100%" borderRadius={1}
                        width={`${Math.max(1, pct(s.value, allocated || 1))}%`}
                        sx={{ background: s.color, transition: 'width 1s ease' }} />
                    </Box>
                    <Typography variant="caption" fontWeight={700}
                      sx={{ width: 80, flexShrink: 0, color: s.value > 0 ? 'text.primary' : 'text.disabled' }}>
                      {s.value > 0 ? fmt(s.value) : '—'}
                    </Typography>
                  </Box>
                ))}
                {(b.category || b.spendCategory || b.investmentType || b.description) && (
                  <Box display="flex" gap={2} mt={1.5} flexWrap="wrap">
                    {b.category       && <Typography variant="caption" color="text.secondary">Category: <b>{b.category}</b></Typography>}
                    {b.spendCategory  && <Typography variant="caption" color="text.secondary">Spend: <b>{b.spendCategory}</b></Typography>}
                    {b.investmentType && <Typography variant="caption" color="text.secondary">Type: <b>{b.investmentType}</b></Typography>}
                    {b.description    && <Typography variant="caption" color="text.secondary">{b.description}</Typography>}
                  </Box>
                )}
              </Box>

              {/* Sub-tasks panel */}
              <Box flex="1" minWidth={240}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary"
                    sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Sub-tasks / Sub-projects
                  </Typography>
                  {canEdit && (
                    <Button size="small" startIcon={<AddIcon />} onClick={(e) => { e.stopPropagation(); openAddSub(); }}
                      sx={{ fontSize: 11, py: 0.3 }}>
                      Add Sub-task
                    </Button>
                  )}
                </Box>
                {subTasks.length === 0
                  ? <Typography variant="caption" color="text.disabled">No sub-tasks yet.</Typography>
                  : subTasks.map(s => (
                    <SubTaskRow key={s.id} sub={s} canEdit={canEdit}
                      onEdit={(sub) => { openEditSub(sub); }}
                      onDelete={deleteSub} />
                  ))
                }
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>

      {/* Sub-task dialog */}
      <Dialog open={subDialog} onClose={() => setSubDialog(false)} maxWidth="xs" fullWidth
        onClick={e => e.stopPropagation()}>
        <DialogTitle>{editingSub ? 'Edit Sub-task' : 'Add Sub-task'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Sub-task name" value={subName}
            onChange={e => setSubName(e.target.value)} margin="normal" required autoFocus />
          <TextField fullWidth type="number" inputProps={{ min: 0 }}
            label="Allocated amount (₹)" value={subAllocated}
            onChange={e => setSubAllocated(e.target.value)} margin="normal" />
          <TextField fullWidth label="Description" value={subDesc}
            onChange={e => setSubDesc(e.target.value)} margin="normal" multiline rows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveSub} disabled={!subName.trim()}>
            {editingSub ? 'Save Changes' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN — all original state names + API calls preserved exactly
══════════════════════════════════════════════════════════════ */
export default function Budgets() {
  const [list,        setList]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [open,        setOpen]        = useState(false);
  const [name,        setName]        = useState('');
  const [allocated,   setAllocated]   = useState('');
  const [description, setDescription] = useState('');
  const [fn,          setFn]          = useState('');       // renamed from businessUnit → function
  const [category,    setCategory]    = useState('');
  const [spendCategory,  setSpendCategory]  = useState('');
  const [investmentType, setInvestmentType] = useState('');
  const [budgetType,     setBudgetType]     = useState('');
  const [nfaRequired,    setNfaRequired]    = useState(''); // 'yes'|'no'|''

  const { user } = useAuth();
  const canEdit = ['Admin', 'Finance'].includes(user?.role);

  const load = () => api.budgets.list().then(setList).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await api.budgets.create({
      name, allocated: parseFloat(allocated), description,
      function: fn, category, spendCategory, investmentType, budgetType,
      nfaRequired,
    });
    setOpen(false);
    setName(''); setAllocated(''); setDescription('');
    setFn(''); setCategory(''); setSpendCategory('');
    setInvestmentType(''); setBudgetType(''); setNfaRequired('');
    load();
  };

  /* sub-task state helpers (optimistic UI) */
  const handleSubTaskSaved = (budgetId, sub) => {
    setList(prev => prev.map(b => {
      if (b.id !== budgetId) return b;
      const existing = b.subTasks || [];
      const idx = existing.findIndex(s => s.id === sub.id);
      return { ...b, subTasks: idx >= 0
        ? existing.map(s => s.id === sub.id ? sub : s)
        : [...existing, sub] };
    }));
  };
  const handleSubTaskDeleted = (budgetId, subId) => {
    setList(prev => prev.map(b => b.id !== budgetId ? b
      : { ...b, subTasks: (b.subTasks || []).filter(s => s.id !== subId) }));
  };

  if (loading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Budgets</Typography>
        {canEdit && (
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
            Add Expense Item
          </Button>
        )}
      </Box>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Allocated</TableCell>
              <TableCell align="right">Spent</TableCell>
              <TableCell align="right">Remaining</TableCell>
              <TableCell align="center">NFA Required</TableCell>
              <TableCell align="center">NFA Approved</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((b) => (
              <ProjectRow key={b.id} b={b} canEdit={canEdit}
                onSubTaskSaved={handleSubTaskSaved}
                onSubTaskDeleted={handleSubTaskDeleted} />
            ))}
            {list.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                  No expense items found. Click "Add Expense Item" to create one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Expense Item</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleCreate}>
            <TextField fullWidth label="Name" value={name}
              onChange={(e) => setName(e.target.value)} margin="normal" required />
            <TextField fullWidth type="number" inputProps={{ min: 0, step: 0.01 }}
              label="Allocated (₹)" value={allocated}
              onChange={(e) => setAllocated(e.target.value)} margin="normal" required />
            <TextField fullWidth label="Description" value={description}
              onChange={(e) => setDescription(e.target.value)} margin="normal" multiline />

            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5} mt={1}>
              <FormControl fullWidth size="small">
                <InputLabel>Function</InputLabel>
                <Select value={fn} label="Function" onChange={e => setFn(e.target.value)}>
                  <MenuItem value=""><em>None</em></MenuItem>
                  {FN_OPTIONS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Budget Type</InputLabel>
                <Select value={budgetType} label="Budget Type" onChange={e => setBudgetType(e.target.value)}>
                  <MenuItem value=""><em>None</em></MenuItem>
                  {BUDGET_TYPE.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select value={category} label="Category" onChange={e => setCategory(e.target.value)}>
                  <MenuItem value=""><em>None</em></MenuItem>
                  {CAT_OPTIONS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Spend Category</InputLabel>
                <Select value={spendCategory} label="Spend Category" onChange={e => setSpendCategory(e.target.value)}>
                  <MenuItem value=""><em>None</em></MenuItem>
                  {SPEND_CAT.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Investment Type</InputLabel>
                <Select value={investmentType} label="Investment Type" onChange={e => setInvestmentType(e.target.value)}>
                  <MenuItem value=""><em>None</em></MenuItem>
                  {INV_TYPE.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>NFA Required?</InputLabel>
                <Select value={nfaRequired} label="NFA Required?" onChange={e => setNfaRequired(e.target.value)}>
                  <MenuItem value=""><em>Unknown</em></MenuItem>
                  <MenuItem value="yes">Yes — NFA needed</MenuItem>
                  <MenuItem value="no">No — NFA not needed</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button type="submit" variant="contained">Create</Button>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}