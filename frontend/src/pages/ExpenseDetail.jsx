/**
 * pages/ExpenseDetail.jsx
 * Route: /budgets/:expenseId
 *
 * Shows the full drill-in view for one Expense:
 *   • Breadcrumb: Budgets > [Expense name]
 *   • Expense summary card (allocated / spent / remaining)
 *   • Transactions panel at Expense level (NFA / PO / Invoice)
 *   • Expense Items list — each expandable to show:
 *       - Expense Item transactions panel
 *       - Tasks list under that expense item
 *           - Each task has its own transactions panel
 *   • Direct tasks (parentType = "expense") listed below expense items
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './app.css';
import TransactionPanel from '../components/TransactionPanel';

const fmt = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const pct = (a, b) => (b ? Math.min(100, (a / b) * 100) : 0);
const tkn  = () => localStorage.getItem('token') || '';
const hj   = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tkn()}` });
const authH = () => ({ Authorization: `Bearer ${tkn()}` });

/* ── Allocated / Spent bar ───────────────────────────────────── */
function BudgetBar({ allocated, spent, compact = false }) {
  const remaining = allocated - spent;
  const utilPct   = pct(spent, allocated);
  const isOverrun = spent > allocated;
  return (
    <Box>
      <Box display="flex" gap={compact ? 2 : 3} flexWrap="wrap" mb={0.5}>
        <Box>
          <Typography variant="caption" color="text.secondary">Allocated</Typography>
          <Typography variant={compact ? 'body2' : 'h6'} fontWeight={700}>{fmt(allocated)}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Spent</Typography>
          <Typography variant={compact ? 'body2' : 'h6'} fontWeight={700} color="warning.main">{fmt(spent)}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Remaining</Typography>
          <Typography variant={compact ? 'body2' : 'h6'} fontWeight={700}
            color={remaining < 0 ? 'error.main' : 'success.main'}>
            {remaining < 0 ? `-${fmt(Math.abs(remaining))}` : fmt(remaining)}
          </Typography>
        </Box>
      </Box>
      <Tooltip title={`${utilPct.toFixed(1)}% utilised`}>
        <LinearProgress variant="determinate" value={utilPct}
          color={isOverrun ? 'error' : utilPct > 85 ? 'warning' : 'primary'}
          sx={{ height: compact ? 4 : 6, borderRadius: 3, maxWidth: 400 }} />
      </Tooltip>
    </Box>
  );
}

/* ── Task card ───────────────────────────────────────────── */
function SubTaskCard({ task, canEdit, onEdit, onDelete, allTags }) {
  const [txOpen, setTxOpen] = useState(false);
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, mb: 1 }}>
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1}>
        <Box flex={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#8B5CF6', flexShrink: 0 }} />
            <Typography variant="body2" fontWeight={700}>{task.name}</Typography>
            {task.nfaCount > 0 && <Chip label={`${task.nfaCount} NFA`} size="small" sx={{ height: 16, fontSize: 9, bgcolor: '#EDE9FE', color: '#5B21B6' }} />}
            {task.poCount > 0 && <Chip label={`${task.poCount} PO`} size="small" sx={{ height: 16, fontSize: 9, bgcolor: '#FEF3C7', color: '#92400E' }} />}
            {task.invCount > 0 && <Chip label={`${task.invCount} INV`} size="small" sx={{ height: 16, fontSize: 9, bgcolor: '#D1FAE5', color: '#065F46' }} />}
          </Box>
          {task.description && <Typography variant="caption" color="text.secondary" ml={2.5} display="block">{task.description}</Typography>}
          <Box ml={2.5} mt={0.5}>
            <BudgetBar allocated={task.allocated || 0} spent={task.spent || 0} compact />
          </Box>
        </Box>
        <Box display="flex" alignItems="center" gap={0.5} flexShrink={0}>
          <Button size="small" onClick={() => setTxOpen(o => !o)}
            sx={{ fontSize: 10, minWidth: 0, px: 1 }}
            endIcon={txOpen ? <KeyboardArrowUpIcon sx={{ fontSize: 14 }} /> : <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />}>
            Docs
          </Button>
          {canEdit && <>
            <IconButton size="small" onClick={() => onEdit(task)} sx={{ color: '#64748B' }}><EditIcon sx={{ fontSize: 14 }} /></IconButton>
            <IconButton size="small" onClick={() => onDelete(task)} sx={{ color: '#EF4444' }}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
          </>}
        </Box>
      </Box>

      <Collapse in={txOpen} unmountOnExit>
        <Box mt={1.5} ml={2.5}>
          <TransactionPanel entityId={task.id} entityType="subTask" />
        </Box>
      </Collapse>
    </Paper>
  );
}

/* ── Expense Item section ─────────────────────────────────────── */
function SubExpenseSection({ se, canEdit, allTags, onEdit, onDelete, expenseId }) {
  const [open,     setOpen]     = useState(false);
  const [tasks,    setTasks]    = useState([]);
  const [txOpen,   setTxOpen]   = useState(false);
  const [taskDialog, setTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskForm, setTaskForm] = useState({ name: '', allocated: '', description: '' });
  const [deleteTask, setDeleteTask] = useState(null);

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch(`/api/tasks?expenseItemId=${se.id}`, { headers: authH() });
      if (r.ok) setTasks(await r.json());
    } catch {}
  }, [se.id]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && tasks.length === 0) loadTasks();
  };

  const openAddTask = () => { setEditingTask(null); setTaskForm({ name:'', allocated:'', description:'' }); setTaskDialog(true); };
  const openEditTask = (t) => { setEditingTask(t); setTaskForm({ name: t.name, allocated: t.allocated, description: t.description||'' }); setTaskDialog(true); };

  const handleSaveTask = async () => {
    if (!taskForm.name) return;
    const body = { ...taskForm, allocated: parseFloat(taskForm.allocated) || 0, expenseId, expenseItemId: se.id, expenseItemId: se.id };
    try {
      if (editingTask) await fetch(`/api/tasks/${editingTask.id}`, { method: 'PATCH', headers: hj(), body: JSON.stringify(body) });
      else await fetch('/api/tasks', { method: 'POST', headers: hj(), body: JSON.stringify(body) });
      setTaskDialog(false);
      loadTasks();
    } catch {}
  };

  const handleDeleteTask = async () => {
    if (!deleteTask) return;
    try {
      await fetch(`/api/tasks/${deleteTask.id}`, { method: 'DELETE', headers: authH() });
      setDeleteTask(null);
      loadTasks();
    } catch {}
  };

  return (
    <Box mb={1.5}>
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {/* Expense Item header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" p={1.5}
          sx={{ cursor: 'pointer', bgcolor: open ? '#F8FAFF' : '#fff', '&:hover': { bgcolor: '#F8FAFF' } }}
          onClick={handleOpen}>
          <Box display="flex" alignItems="center" gap={1} flex={1}>
            <IconButton size="small" sx={{ p: 0.2 }}>
              {open ? <KeyboardArrowUpIcon sx={{ fontSize: 18 }} /> : <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />}
            </IconButton>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#F97316', flexShrink: 0 }} />
            <Typography variant="body2" fontWeight={700}>{se.name}</Typography>
            {se.subTaskCount > 0 && <Chip label={`${se.subTaskCount} tasks`} size="small" sx={{ height: 16, fontSize: 9, bgcolor: '#F0FDF4', color: '#065F46' }} />}
            {se.nfaCount > 0 && <Chip label={`${se.nfaCount} NFA`} size="small" sx={{ height: 16, fontSize: 9, bgcolor: '#EDE9FE', color: '#5B21B6' }} />}
            {se.poCount > 0 && <Chip label={`${se.poCount} PO`} size="small" sx={{ height: 16, fontSize: 9, bgcolor: '#FEF3C7', color: '#92400E' }} />}
          </Box>
          <Box display="flex" alignItems="center" gap={1} onClick={e => e.stopPropagation()}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">{fmt(se.allocated)}</Typography>
            <Button size="small" onClick={() => setTxOpen(o => !o)} sx={{ fontSize: 10, minWidth: 0, px: 1 }}>Docs</Button>
            {canEdit && <>
              <IconButton size="small" onClick={() => onEdit(se)} sx={{ color: '#64748B' }}><EditIcon sx={{ fontSize: 14 }} /></IconButton>
              <IconButton size="small" onClick={() => onDelete(se)} sx={{ color: '#EF4444' }}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
            </>}
          </Box>
        </Box>

        {/* Expense Item transactions */}
        <Collapse in={txOpen} unmountOnExit>
          <Box px={2.5} pb={1.5} sx={{ borderTop: '1px solid #F1F5F9' }}>
            <TransactionPanel entityId={se.id} entityType="subExpense" />
          </Box>
        </Collapse>

        {/* Tasks under this Expense Item */}
        <Collapse in={open} unmountOnExit>
          <Box px={2} pb={1.5} sx={{ borderTop: '1px solid #F1F5F9' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" my={1.2}>
              <Typography variant="caption" fontWeight={700} color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Tasks ({tasks.length})
              </Typography>
              {canEdit && (
                <Button size="small" startIcon={<AddIcon />} onClick={openAddTask} sx={{ fontSize: 11 }}>
                  Add Task
                </Button>
              )}
            </Box>
            {tasks.length === 0
              ? <Typography variant="caption" color="text.disabled">No tasks under this Expense Item yet.</Typography>
              : tasks.map(t => (
                <SubTaskCard key={t.id} task={t} canEdit={canEdit} allTags={allTags}
                  onEdit={openEditTask} onDelete={setDeleteTask} />
              ))
            }
          </Box>
        </Collapse>
      </Paper>

      {/* Add/edit task dialog */}
      <Dialog open={taskDialog} onClose={() => setTaskDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingTask ? 'Edit Task' : 'Add Task'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name *" value={taskForm.name}
            onChange={e => setTaskForm(f => ({ ...f, name: e.target.value }))} margin="normal" autoFocus />
          <TextField fullWidth type="number" label="Allocated (₹)" value={taskForm.allocated}
            onChange={e => setTaskForm(f => ({ ...f, allocated: e.target.value }))} margin="normal" inputProps={{ min: 0 }} />
          <TextField fullWidth label="Description" value={taskForm.description}
            onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} margin="normal" multiline rows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTaskDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTask} disabled={!taskForm.name}>
            {editingTask ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete task confirm */}
      <Dialog open={!!deleteTask} onClose={() => setDeleteTask(null)} maxWidth="xs">
        <DialogTitle>Delete Task?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Delete <b>{deleteTask?.name}</b>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTask(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteTask}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function ExpenseDetail() {
  const { expenseId } = useParams();
  const navigate      = useNavigate();
  const { user }      = useAuth();
  const canEdit       = ['Admin', 'Finance'].includes(user?.role);

  const [expense,     setExpense]     = useState(null);
  const [subExpenses, setSubExpenses] = useState([]);
  const [directTasks, setDirectTasks] = useState([]);
  const [allTags,     setAllTags]     = useState([]);
  const [loading,     setLoading]     = useState(true);

  // Expense Item dialog
  const [seDialog,  setSeDialog]  = useState(false);
  const [editingSe, setEditingSe] = useState(null);
  const [seForm,    setSeForm]    = useState({ name: '', allocated: '', description: '' });
  const [deleteSe,  setDeleteSe]  = useState(null);

  // Direct task dialog
  const [dtDialog,  setDtDialog]  = useState(false);
  const [editingDt, setEditingDt] = useState(null);
  const [dtForm,    setDtForm]    = useState({ name: '', allocated: '', description: '' });
  const [deleteDt,  setDeleteDt]  = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [expR, seR, dtR, tagR] = await Promise.all([
        fetch(`/api/expense-heads/${expenseId}`,               { headers: authH() }),
        fetch(`/api/expense-items?expenseHeadId=${expenseId}`, { headers: authH() }),
        fetch(`/api/tasks?expenseHeadId=${expenseId}`,    { headers: authH() }),
        fetch('/api/tags',                                { headers: authH() }),
      ]);
      if (expR.ok) setExpense(await expR.json());
      if (seR.ok)  setSubExpenses(await seR.json());
      if (dtR.ok)  {
        const tasks = await dtR.json();
        // Only direct tasks (parentType === "expense")
        setDirectTasks(tasks.filter(t => t.parentType === 'expense'));
      }
      if (tagR.ok) setAllTags(await tagR.json());
    } catch {}
    setLoading(false);
  }, [expenseId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── Expense Item CRUD ── */
  const openAddSe  = () => { setEditingSe(null); setSeForm({ name:'', allocated:'', description:'' }); setSeDialog(true); };
  const openEditSe = (se) => { setEditingSe(se); setSeForm({ name: se.name, allocated: se.allocated, description: se.description||'' }); setSeDialog(true); };

  const handleSaveSe = async () => {
    if (!seForm.name) return;
    const body = { ...seForm, allocated: parseFloat(seForm.allocated) || 0, expenseId };
    try {
      if (editingSe) await fetch(`/api/expense-items/${editingSe.id}`, { method: 'PATCH', headers: hj(), body: JSON.stringify(body) });
      else await fetch('/api/expense-items', { method: 'POST', headers: hj(), body: JSON.stringify(body) });
      setSeDialog(false);
      loadAll();
    } catch {}
  };

  const handleDeleteSe = async () => {
    if (!deleteSe) return;
    try {
      await fetch(`/api/expense-items/${deleteSe.id}`, { method: 'DELETE', headers: authH() });
      setDeleteSe(null);
      loadAll();
    } catch {}
  };

  /* ── Direct task CRUD ── */
  const openAddDt  = () => { setEditingDt(null); setDtForm({ name:'', allocated:'', description:'' }); setDtDialog(true); };
  const openEditDt = (t) => { setEditingDt(t); setDtForm({ name: t.name, allocated: t.allocated, description: t.description||'' }); setDtDialog(true); };

  const handleSaveDt = async () => {
    if (!dtForm.name) return;
    const body = { ...dtForm, allocated: parseFloat(dtForm.allocated) || 0, expenseId, expenseItemId: null };
    try {
      if (editingDt) await fetch(`/api/tasks/${editingDt.id}`, { method: 'PATCH', headers: hj(), body: JSON.stringify(body) });
      else await fetch('/api/tasks', { method: 'POST', headers: hj(), body: JSON.stringify(body) });
      setDtDialog(false);
      loadAll();
    } catch {}
  };

  const handleDeleteDt = async () => {
    if (!deleteDt) return;
    try {
      await fetch(`/api/tasks/${deleteDt.id}`, { method: 'DELETE', headers: authH() });
      setDeleteDt(null);
      loadAll();
    } catch {}
  };

  if (loading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  if (!expense) return <Box p={4}><Typography color="error">Expense not found.</Typography></Box>;

  return (
    <Box>
      {/* ── Breadcrumb ── */}
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <IconButton size="small" onClick={() => navigate('/budgets')}><ArrowBackIcon /></IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
          onClick={() => navigate('/budgets')}>
          Budgets
        </Typography>
        <Typography variant="body2" color="text.secondary">›</Typography>
        <Typography variant="body2" fontWeight={700}>{expense.name}</Typography>
        {expense.fy && <Chip label={expense.fy} size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#EEF2FF', color: '#4338CA' }} />}
      </Box>

      {/* ── Expense summary card ── */}
      <Card sx={{ p: 2.5, mb: 2.5 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
          <Box flex={1}>
            <Typography variant="h5" fontWeight={700} mb={0.5}>{expense.name}</Typography>
            <Box display="flex" gap={1.5} flexWrap="wrap" mb={1.5}>
              {expense.function    && <Chip label={expense.function}    size="small" sx={{ height: 20, fontSize: 10 }} />}
              {expense.budgetType  && <Chip label={expense.budgetType}  size="small" color={expense.budgetType === 'Capex' ? 'secondary' : 'primary'} variant="outlined" sx={{ height: 20, fontSize: 10 }} />}
              {expense.category    && <Chip label={expense.category}    size="small" sx={{ height: 20, fontSize: 10, bgcolor: '#F1F5F9' }} />}
              {expense.nfaRequired === 'yes' && <Chip label="NFA Required" size="small" sx={{ height: 20, fontSize: 10, bgcolor: '#EDE9FE', color: '#5B21B6' }} />}
            </Box>
            <BudgetBar allocated={expense.allocated || 0} spent={expense.spent || 0} />
          </Box>
        </Box>
        {expense.description && (
          <Typography variant="body2" color="text.secondary" mt={1.5}>{expense.description}</Typography>
        )}
      </Card>

      {/* ── Expense-level Transactions ── */}
      <Box mb={3}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>
          Documents at Expense Head Level
        </Typography>
        <TransactionPanel entityId={expenseId} entityType="expense" />
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* ── Expense Items ── */}
      <Box mb={3}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Typography variant="subtitle1" fontWeight={700}>
            Expense Items ({subExpenses.length})
          </Typography>
          {canEdit && (
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={openAddSe}>
              Add Expense Item
            </Button>
          )}
        </Box>
        {subExpenses.length === 0
          ? <Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No expense items yet.</Typography>
          : subExpenses.map(se => (
            <SubExpenseSection key={se.id} se={se} canEdit={canEdit} allTags={allTags}
              expenseId={expenseId}
              onEdit={openEditSe} onDelete={setDeleteSe} />
          ))
        }
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* ── Direct tasks (parentType = "expense") ── */}
      <Box mb={3}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Typography variant="subtitle1" fontWeight={700}>
            Tasks directly under this Expense Head ({directTasks.length})
          </Typography>
          {canEdit && (
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={openAddDt}>
              Add Task
            </Button>
          )}
        </Box>
        {directTasks.length === 0
          ? <Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No Tasks directly under this Expense Head yet.</Typography>
          : directTasks.map(t => (
            <SubTaskCard key={t.id} task={t} canEdit={canEdit} allTags={allTags}
              onEdit={openEditDt} onDelete={setDeleteDt} />
          ))
        }
      </Box>

      {/* ── Expense Item dialogs ── */}
      <Dialog open={seDialog} onClose={() => setSeDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingSe ? 'Edit Expense Item' : 'Add Expense Item'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name *" value={seForm.name} onChange={e => setSeForm(f => ({ ...f, name: e.target.value }))} margin="normal" autoFocus />
          <TextField fullWidth type="number" label="Allocated (₹)" value={seForm.allocated} onChange={e => setSeForm(f => ({ ...f, allocated: e.target.value }))} margin="normal" inputProps={{ min: 0 }} />
          <TextField fullWidth label="Description" value={seForm.description} onChange={e => setSeForm(f => ({ ...f, description: e.target.value }))} margin="normal" multiline rows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveSe} disabled={!seForm.name}>{editingSe ? 'Save' : 'Add'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteSe} onClose={() => setDeleteSe(null)} maxWidth="xs">
        <DialogTitle>Delete Expense Item?</DialogTitle>
        <DialogContent><Typography variant="body2">Delete <b>{deleteSe?.name}</b>? Any tasks under it will also be deleted.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteSe(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteSe}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* ── Direct task dialogs ── */}
      <Dialog open={dtDialog} onClose={() => setDtDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingDt ? 'Edit Task' : 'Add Task'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name *" value={dtForm.name} onChange={e => setDtForm(f => ({ ...f, name: e.target.value }))} margin="normal" autoFocus />
          <TextField fullWidth type="number" label="Allocated (₹)" value={dtForm.allocated} onChange={e => setDtForm(f => ({ ...f, allocated: e.target.value }))} margin="normal" inputProps={{ min: 0 }} />
          <TextField fullWidth label="Description" value={dtForm.description} onChange={e => setDtForm(f => ({ ...f, description: e.target.value }))} margin="normal" multiline rows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDtDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveDt} disabled={!dtForm.name}>{editingDt ? 'Save' : 'Add'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteDt} onClose={() => setDeleteDt(null)} maxWidth="xs">
        <DialogTitle>Delete Task?</DialogTitle>
        <DialogContent><Typography variant="body2">Delete <b>{deleteDt?.name}</b>?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDt(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteDt}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}