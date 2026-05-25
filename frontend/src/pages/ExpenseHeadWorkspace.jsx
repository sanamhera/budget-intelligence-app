import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './app.css';

const fmt   = v  => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const pct   = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
const tkn   = () => localStorage.getItem('token') || '';
const hj    = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tkn()}` });
const authH = () => ({ Authorization: `Bearer ${tkn()}` });

const STAGES = [
  { key: 'nfa',     label: 'NFA',    color: '#7C3AED', bg: '#EDE9FE', txType: 'NFA'     },
  { key: 'po',      label: 'PO',     color: '#1D4ED8', bg: '#DBEAFE', txType: 'PO'      },
  { key: 'invoice', label: 'Invoice',color: '#C2410C', bg: '#FFEDD5', txType: 'INVOICE' },
  { key: 'payment', label: 'Paid',   color: '#065F46', bg: '#D1FAE5', txType: 'PAYMENT' },
];

/* ── Modal ───────────────────────────────────────────────── */
function Modal({ open, onClose, title, children, footer, small }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${small ? ' modal-sm' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Pipeline ────────────────────────────────────────────── */
function Pipeline({ status, compact }) {
  if (!status) return null;
  return (
    <div className="pipeline">
      {STAGES.map((s, i) => {
        const done = !!(status.nfaApproved && s.key === 'nfa'
          || status.poRaised   && s.key === 'po'
          || status.invoiced   && s.key === 'invoice'
          || status.paid       && s.key === 'payment');
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {i > 0 && <span className="pipeline-arrow">→</span>}
            <div className={`pipeline-stage${done ? ' done' : ' undone'}`}
              style={done ? { background: s.bg, border: `1px solid ${s.color}55`, color: s.color } : {}}>
              <span style={{ fontSize: 9 }}>{done ? '✔' : '○'}</span>
              {!compact && s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Overview tab ────────────────────────────────────────── */
function OverviewTab({ head, items, tasks }) {
  const completedTasks = tasks.filter(t => t.status === 'Closed').length;
  return (
    <div>
      <div className="cards-row" style={{ marginBottom: 24 }}>
        {[
          { label: 'Expense Items', value: items.length,           color: '#4F6EF7' },
          { label: 'Total Tasks',   value: tasks.length,           color: '#8B5CF6' },
          { label: 'Completed',     value: completedTasks,         color: '#10B981' },
          { label: 'Pending',       value: tasks.length - completedTasks, color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="card-label">{s.label}</div>
            <div className="card-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Execution Pipeline</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {STAGES.map((s, i) => {
            const count = tasks.filter(t => (t.transactions || []).some(tx => tx.type === s.txType)).length;
            const prog  = tasks.length ? Math.round((count / tasks.length) * 100) : 0;
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {i > 0 && <div style={{ width: 32, height: 2, background: '#E2E8F0', borderRadius: 1 }} />}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto 6px',
                    background: count > 0 ? s.bg : '#F8FAFC',
                    border: `2px solid ${count > 0 ? s.color : '#E2E8F0'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: count > 0 ? s.color : '#CBD5E1' }}>{count}</span>
                  </div>
                  <span className="chip" style={{ background: count > 0 ? s.bg : '#F8FAFC', color: count > 0 ? s.color : '#94A3B8', fontSize: 10 }}>
                    {s.label}
                  </span>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{prog}% of tasks</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Expense Items</div>
          {items.map(item => {
            const itemTasks = tasks.filter(t => t.expenseItemId === item.id);
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F97316', flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{item.name}</span>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>{itemTasks.length} task{itemTasks.length !== 1 ? 's' : ''}</span>
                <span style={{ fontWeight: 700, color: '#4F6EF7', fontSize: 13 }}>{fmt(item.allocated)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Expense Items tab ───────────────────────────────────── */
function ExpenseItemsTab({ headId, items, tasks, canEdit, onRefresh }) {
  const [expanded,    setExpanded]    = useState({});
  const [addOpen,     setAddOpen]     = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);
  const [deleteTarget,setDeleteTarget]= useState(null);
  const [form,        setForm]        = useState({ name: '', allocated: '', description: '' });
  const [saving,      setSaving]      = useState(false);

  const openAdd  = ()    => { setEditTarget(null); setForm({ name: '', allocated: '', description: '' }); setAddOpen(true); };
  const openEdit = item  => { setEditTarget(item); setForm({ name: item.name, allocated: item.allocated || '', description: item.description || '' }); setAddOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editTarget) {
        await fetch(`/api/expense-items/${editTarget.id}`, { method: 'PATCH', headers: hj(), body: JSON.stringify({ name: form.name.trim(), allocated: parseFloat(form.allocated) || 0, description: form.description }) });
      } else {
        await fetch('/api/expense-items', { method: 'POST', headers: hj(), body: JSON.stringify({ name: form.name.trim(), allocated: parseFloat(form.allocated) || 0, description: form.description, expenseHeadId: headId }) });
      }
      setAddOpen(false); onRefresh();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await fetch(`/api/expense-items/${deleteTarget.id}`, { method: 'DELETE', headers: authH() }); } catch {}
    setDeleteTarget(null); onRefresh();
  };

  return (
    <div>
      {canEdit && (
        <div style={{ marginBottom: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Expense Item</button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">📂</span>
          <p className="empty-title">No Expense Items yet</p>
          <p className="empty-sub">Expense Items group related tasks together</p>
          {canEdit && <button className="btn btn-outline btn-sm" onClick={openAdd}>+ Add First Expense Item</button>}
        </div>
      ) : items.map(item => {
        const itemTasks = tasks.filter(t => t.expenseItemId === item.id);
        const isOpen    = expanded[item.id];
        return (
          <div key={item.id} style={{ marginBottom: 10, border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', cursor: 'pointer', background: isOpen ? '#F8FAFF' : '#fff' }}
              onClick={() => setExpanded(e => ({ ...e, [item.id]: !e[item.id] }))}>
              <button className="expand-btn">{isOpen ? '▼' : '▶'}</button>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F97316', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{item.name}</span>
              {item.description && <span style={{ fontSize: 12, color: '#94A3B8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</span>}
              <span className="chip chip-green" style={{ fontSize: 9 }}>{itemTasks.length} Task{itemTasks.length !== 1 ? 's' : ''}</span>
              <span style={{ fontWeight: 700, color: '#4F6EF7', fontSize: 13, minWidth: 80, textAlign: 'right' }}>{fmt(item.allocated)}</span>
              {canEdit && (
                <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                  <button className="btn-icon" onClick={() => openEdit(item)}>✏</button>
                  <button className="btn-icon red" onClick={() => setDeleteTarget(item)}>🗑</button>
                </div>
              )}
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid #F1F5F9', padding: '10px 24px' }}>
                {itemTasks.length === 0
                  ? <span style={{ fontSize: 12, color: '#CBD5E1' }}>No tasks under this item.</span>
                  : itemTasks.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', borderBottom: '1px dashed #F1F5F9' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B5CF6', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{t.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#4F6EF7' }}>{fmt(t.allocated)}</span>
                      <span className="chip" style={{ fontSize: 9, background: t.status === 'Overrun' ? '#FEE2E2' : '#F0FDF4', color: t.status === 'Overrun' ? '#991B1B' : '#065F46' }}>{t.status || 'Active'}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        );
      })}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} small title={editTarget ? 'Edit Expense Item' : 'Add Expense Item'}
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : editTarget ? 'Save' : 'Add'}</button>
        </>}>
        <div className="field"><label>Name *</label><input value={form.name} autoFocus onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div className="field"><label>Allocated (₹)</label><input type="number" min={0} value={form.allocated} onChange={e => setForm(f => ({ ...f, allocated: e.target.value }))} /></div>
        <div className="field"><label>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} small title="Delete Expense Item?"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
        </>}>
        <p style={{ margin: 0, fontSize: 13 }}>Delete <strong>{deleteTarget?.name}</strong>?</p>
      </Modal>
    </div>
  );
}

/* ── Tasks tab ───────────────────────────────────────────── */
function TasksTab({ headId, items, tasks, canEdit, onRefresh, onSelectTask }) {
  const [search,      setSearch]      = useState('');
  const [filterItem,  setFilterItem]  = useState('all');
  const [addOpen,     setAddOpen]     = useState(false);
  const [deleteTarget,setDeleteTarget]= useState(null);
  const [form,        setForm]        = useState({ name: '', allocated: '', expenseItemId: '', description: '', nfaRequired: 'no' });
  const [saving,      setSaving]      = useState(false);

  const filtered = tasks.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchItem   = filterItem === 'all' || (filterItem === 'direct' ? !t.expenseItemId : t.expenseItemId === filterItem);
    return matchSearch && matchItem;
  });

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/tasks', { method: 'POST', headers: hj(), body: JSON.stringify({ name: form.name.trim(), allocated: parseFloat(form.allocated) || 0, description: form.description, nfaRequired: form.nfaRequired, expenseHeadId: headId, expenseItemId: form.expenseItemId || null }) });
      setAddOpen(false); setForm({ name: '', allocated: '', expenseItemId: '', description: '', nfaRequired: 'no' }); onRefresh();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await fetch(`/api/tasks/${deleteTarget.id}`, { method: 'DELETE', headers: authH() }); } catch {}
    setDeleteTarget(null); onRefresh();
  };

  const getItemName = id => items.find(i => i.id === id)?.name || '—';

  return (
    <div>
      <div className="filters-row">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94A3B8',pointerEvents:'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="search-input" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={filterItem} onChange={e => setFilterItem(e.target.value)}>
          <option value="all">All Tasks</option>
          <option value="direct">Direct Tasks</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        {canEdit && <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setAddOpen(true)}>+ Add Task</button>}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">✅</span>
          <p className="empty-title">{tasks.length === 0 ? 'No tasks yet' : 'No tasks match filters'}</p>
          {canEdit && tasks.length === 0 && <button className="btn btn-outline btn-sm" onClick={() => setAddOpen(true)}>+ Add First Task</button>}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Task Name</th>
                <th>Expense Item</th>
                <th style={{ textAlign: 'right' }}>Allocated</th>
                <th style={{ textAlign: 'center' }}>NFA</th>
                <th style={{ textAlign: 'center' }}>PO</th>
                <th style={{ textAlign: 'center' }}>Invoice</th>
                <th style={{ textAlign: 'center' }}>Paid</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map(task => {
                const tx  = task.transactions || [];
                const has = type => tx.some(t => t.type === type);
                return (
                  <tr key={task.id} style={{ cursor: 'pointer' }} onClick={() => onSelectTask(task)}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{task.name}</div>
                      {task.description && <div style={{ fontSize: 11, color: '#94A3B8' }}>{task.description}</div>}
                    </td>
                    <td>
                      {task.expenseItemId
                        ? <span className="chip chip-orange" style={{ fontSize: 9 }}>{getItemName(task.expenseItemId)}</span>
                        : <span style={{ color: '#CBD5E1', fontSize: 12 }}>Direct</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(task.allocated)}</td>
                    {STAGES.map(s => (
                      <td key={s.key} style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 16, color: has(s.txType) ? s.color : '#E2E8F0' }}>
                          {has(s.txType) ? '✔' : '○'}
                        </span>
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}>
                      <span className="chip" style={{ fontSize: 9, background: task.status === 'Overrun' ? '#FEE2E2' : task.status === 'Closed' ? '#F1F5F9' : '#D1FAE5', color: task.status === 'Overrun' ? '#991B1B' : task.status === 'Closed' ? '#475569' : '#065F46' }}>
                        {task.status || 'Active'}
                      </span>
                    </td>
                    {canEdit && (
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn-icon red" onClick={() => setDeleteTarget(task)}>🗑</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} small title="Add Task"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !form.name.trim()}>{saving ? 'Adding…' : 'Add Task'}</button>
        </>}>
        <div className="field"><label>Task Name *</label><input value={form.name} autoFocus onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div className="field"><label>Allocated (₹)</label><input type="number" min={0} value={form.allocated} onChange={e => setForm(f => ({ ...f, allocated: e.target.value }))} /></div>
        <div className="field">
          <label>Expense Item (optional)</label>
          <select value={form.expenseItemId} onChange={e => setForm(f => ({ ...f, expenseItemId: e.target.value }))}>
            <option value="">Direct under Expense Head</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>NFA Required</label>
          <select value={form.nfaRequired} onChange={e => setForm(f => ({ ...f, nfaRequired: e.target.value }))}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div className="field"><label>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} small title="Delete Task?"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
        </>}>
        <p style={{ margin: 0, fontSize: 13 }}>Delete <strong>{deleteTarget?.name}</strong>?</p>
      </Modal>
    </div>
  );
}

/* ── Execution Flow tab ──────────────────────────────────── */
function ExecutionFlowTab({ tasks }) {
  if (tasks.length === 0) return (
    <div className="empty"><span className="empty-icon">🔄</span><p className="empty-title">No tasks yet</p></div>
  );
  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 20 }}>Pipeline — {tasks.length} Tasks</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {STAGES.map((s, i) => {
            const count = tasks.filter(t => (t.transactions || []).some(tx => tx.type === s.txType)).length;
            const prog  = tasks.length ? Math.round((count / tasks.length) * 100) : 0;
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div style={{ width: 40, height: 2, background: '#E2E8F0', margin: '0 8px' }} />}
                <div style={{ textAlign: 'center', minWidth: 90 }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', margin: '0 auto 8px', background: count > 0 ? s.bg : '#F8FAFC', border: `2px solid ${count > 0 ? s.color : '#E2E8F0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: count > 0 ? s.color : '#CBD5E1' }}>{count}</span>
                  </div>
                  <span className="chip" style={{ background: count > 0 ? s.bg : '#F8FAFC', color: count > 0 ? s.color : '#94A3B8', fontSize: 11 }}>{s.label}</span>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>{prog}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              {STAGES.map(s => <th key={s.key} style={{ textAlign: 'center', color: s.color }}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {tasks.map(task => (
              <tr key={task.id}>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{task.name}</td>
                {STAGES.map(s => {
                  const done = (task.transactions || []).some(t => t.type === s.txType);
                  return (
                    <td key={s.key} style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 16, color: done ? s.color : '#E2E8F0' }}>{done ? '✔' : '○'}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Documents tab — FIXED ───────────────────────────────── */
/* No upload capability. Fetches transactions from:
   - Expense Head
   - All Expense Items under the head
   - All Tasks under the head (direct) and under items
   Shows: Document Type | Document Name | Code | Vendor | Amount | Download
*/
function DocumentsTab({ headId, items, tasks }) {
  const [transactions, setTransactions] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [typeFilter,   setTypeFilter]   = useState('ALL');
  const [search,       setSearch]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch transactions for the expense head
      const headTx = await fetch(`/api/transactions?entityId=${headId}&entityType=expenseHead`, { headers: authH() })
        .then(r => r.ok ? r.json() : []).catch(() => []);
      
      // Fetch transactions for all items
      const itemsTx = (await Promise.all(items.map(item =>
        fetch(`/api/transactions?entityId=${item.id}&entityType=expenseItem`, { headers: authH() })
          .then(r => r.ok ? r.json() : []).catch(() => [])
      ))).flat();
      
      // Fetch transactions for all tasks
      const tasksTx = (await Promise.all(tasks.map(task =>
        fetch(`/api/transactions?entityId=${task.id}&entityType=task`, { headers: authH() })
          .then(r => r.ok ? r.json() : []).catch(() => [])
      ))).flat();
      
      // Combine and filter only those with files and valid document types
      const allTx = [...headTx, ...itemsTx, ...tasksTx];
      const withFiles = allTx.filter(t => t.fileUrl && (t.type === 'NFA' || t.type === 'PO' || t.type === 'INVOICE' || t.type === 'PAYMENT'));
      setTransactions(withFiles);
    } catch {}
    setLoading(false);
  }, [headId, items, tasks]);

  useEffect(() => { load(); }, [load]);

  // Filter by document type
  const byType = typeFilter === 'ALL' ? transactions : transactions.filter(t => t.type === typeFilter);
  
  // Filter by search keyword (name, code, vendor)
  const filtered = byType.filter(t => {
    const searchLower = search.toLowerCase();
    return (
      (t.fileName || '').toLowerCase().includes(searchLower) ||
      (t.description || '').toLowerCase().includes(searchLower) ||
      (t.nfaNumber || '').toLowerCase().includes(searchLower) ||
      (t.poCode || '').toLowerCase().includes(searchLower) ||
      (t.invoiceNumber || '').toLowerCase().includes(searchLower) ||
      (t.paymentRef || '').toLowerCase().includes(searchLower) ||
      (t.vendorName || '').toLowerCase().includes(searchLower)
    );
  });

  // Get code based on document type
  const getDocCode = (tx) => {
    switch(tx.type) {
      case 'NFA':      return tx.nfaNumber || '—';
      case 'PO':       return tx.poCode || '—';
      case 'INVOICE':  return tx.invoiceNumber || '—';
      case 'PAYMENT':  return tx.paymentRef || '—';
      default:         return '—';
    }
  };

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  return (
    <div>
      {/* Filter tabs + Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {['ALL','NFA','PO','INVOICE','PAYMENT'].map(type => (
          <button key={type} className={`fy-chip ${typeFilter === type ? 'active' : 'inactive'}`}
            onClick={() => setTypeFilter(type)}>
            {type === 'ALL' ? 'All Documents' : type}
          </button>
        ))}
        
        {/* Search input */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', position: 'relative' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" 
            style={{ position:'absolute', left: 10, color:'#94A3B8', pointerEvents:'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, code, vendor…"
            style={{
              paddingLeft: 32,
              padding: '7px 12px 7px 32px',
              border: '1.5px solid #E2E8F0',
              borderRadius: 8,
              fontSize: 13,
              outline: 'none',
              minWidth: 240,
            }}
            onFocus={e => e.currentTarget.style.borderColor = '#4F6EF7'}
            onBlur={e => e.currentTarget.style.borderColor = '#E2E8F0'}
          />
        </div>
      </div>

      {/* Documents table */}
      {filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">📄</span>
          <p className="empty-title">{transactions.length === 0 ? 'No documents available' : 'No documents match your search'}</p>
          <p className="empty-sub">Documents uploaded in NFA, PO, Invoice, and Payment tabs will appear here for download</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document Type</th>
                <th>Document Name</th>
                <th>Code</th>
                <th>Vendor / Reference</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => {
                const s = STAGES.find(st => st.txType === tx.type) || STAGES[0];
                const docName = tx.fileName || tx.description || 'Document';
                const docCode = getDocCode(tx);
                return (
                  <tr key={tx.id}>
                    <td>
                      <span className="chip" style={{ background: s.bg, color: s.color, fontSize: 9, fontWeight: 700 }}>
                        {tx.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{docName}</td>
                    <td style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>{docCode}</td>
                    <td style={{ fontSize: 12, color: '#94A3B8' }}>{tx.vendorName || tx.referenceNo || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#4F6EF7' }}>
                      {tx.amount > 0 ? fmt(tx.amount) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        className="btn-icon" 
                        onClick={() => { 
                          const a = document.createElement('a'); 
                          a.href = tx.fileUrl; 
                          a.download = tx.fileName || 'document'; 
                          a.click(); 
                        }} 
                        title="Download">
                        ↓
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Task Drawer ─────────────────────────────────────────── */
function TaskDrawer({ task, items, open, onClose }) {
  if (!task || !open) return null;
  const itemName = items.find(i => i.id === task.expenseItemId)?.name;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 380, background: '#fff', height: '100%', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{task.name}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{itemName ? `Under: ${itemName}` : 'Direct Task'}</div>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>Allocated</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#4F6EF7' }}>{fmt(task.allocated)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>Status</div>
              <span className="chip" style={{ marginTop: 4, display: 'inline-block', background: task.status === 'Overrun' ? '#FEE2E2' : '#D1FAE5', color: task.status === 'Overrun' ? '#991B1B' : '#065F46' }}>
                {task.status || 'Active'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>NFA Required</div>
              <span className="chip" style={{ marginTop: 4, display: 'inline-block', background: task.nfaRequired === 'yes' ? '#EDE9FE' : '#F0FDF4', color: task.nfaRequired === 'yes' ? '#5B21B6' : '#065F46' }}>
                {task.nfaRequired === 'yes' ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {task.description && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 6 }}>Description</div>
              <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>{task.description}</p>
            </div>
          )}

          <hr className="divider" />
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 14 }}>Execution Status</div>
          <div className="steps">
            {STAGES.map((s, i) => {
              const tx   = (task.transactions || []).filter(t => t.type === s.txType);
              const done = tx.length > 0;
              return (
                <div key={s.key} className="step-row">
                  <div className={`step-circle${done ? ' done' : ' todo'}`}>
                    {done ? '✔' : i + 1}
                  </div>
                  <div className="step-info">
                    <div className="step-label" style={{ color: done ? s.color : '#94A3B8' }}>{s.label}</div>
                    {done && tx[0].vendorName && <div className="step-sub">{tx[0].vendorName}</div>}
                    {done && tx[0].amount > 0  && <div style={{ fontSize: 12, fontWeight: 700, color: '#4F6EF7' }}>{fmt(tx[0].amount)}</div>}
                    {!done && <div className="step-sub">Not started</div>}
                  </div>
                  {done && <span className="chip" style={{ background: s.bg, color: s.color, fontSize: 9 }}>Done</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
const TABS = ['Overview', 'Expense Items', 'Tasks', 'Execution Flow', 'Documents'];

export default function ExpenseHeadWorkspace() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const canEdit   = ['Admin', 'Finance'].includes(user?.role);

  const [head,        setHead]        = useState(null);
  const [items,       setItems]       = useState([]);
  const [tasks,       setTasks]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState(0);
  const [selectedTask,setSelectedTask]= useState(null);
  const [drawerOpen,  setDrawerOpen]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [headR, itemsR, tasksR] = await Promise.all([
        fetch(`/api/expense-heads/${id}`,               { headers: authH() }),
        fetch(`/api/expense-items?expenseHeadId=${id}`, { headers: authH() }),
        fetch(`/api/tasks?expenseHeadId=${id}`,         { headers: authH() }),
      ]);
      if (headR.ok)  setHead(await headR.json());
      if (itemsR.ok) setItems(await itemsR.json());
      if (tasksR.ok) {
        const taskList = await tasksR.json();
        const enriched = await Promise.all(taskList.map(async t => {
          try {
            const r = await fetch(`/api/transactions?entityId=${t.id}`, { headers: authH() });
            return { ...t, transactions: r.ok ? await r.json() : [] };
          } catch { return { ...t, transactions: [] }; }
        }));
        setTasks(enriched);
      }
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  if (!head) return (
    <div className="page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/budgets')}>← Back</button>
      <div className="alert alert-error" style={{ marginTop: 16 }}>Expense Head not found.</div>
    </div>
  );

  const spent     = Number(head.spent     || 0);
  const allocated = Number(head.allocated || 0);
  const remaining = allocated - spent;
  const utilPct   = pct(spent, allocated);

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 24px 0' }}>

        {/* Breadcrumb */}
        <div className="breadcrumb">
          <span className="breadcrumb a" style={{ cursor: 'pointer', color: '#94A3B8' }} onClick={() => navigate('/budgets')}>← Budgets</span>
          <span className="breadcrumb-sep">/</span>
          <span style={{ fontWeight: 600, color: '#0F172A' }}>{head.name}</span>
        </div>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{head.name}</h1>
              {head.budgetType && (
                <span className={`chip ${head.budgetType === 'Capex' ? 'chip-purple' : 'chip-blue'}`}>{head.budgetType}</span>
              )}
              {head.nfaRequired === 'yes' && (
                <span className="chip chip-purple">NFA Required</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#64748B' }}>
              {head.function    && <span>{head.function}</span>}
              {head.category    && <span>· {head.category}</span>}
              {head.description && <span>· {head.description}</span>}
            </div>
          </div>

          {canEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setActiveTab(1)}>+ Add Item</button>
              <button className="btn btn-primary btn-sm" onClick={() => setActiveTab(2)}>+ Add Task</button>
            </div>
          )}
        </div>

        {/* Metrics */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: 'Allocated', value: fmt(allocated),             color: '#4F6EF7' },
            { label: 'Spent',     value: fmt(spent),                 color: '#F59E0B' },
            { label: 'Remaining', value: fmt(remaining),             color: remaining < 0 ? '#EF4444' : '#10B981' },
            { label: 'Items',     value: `${items.length} Items`,    color: '#F97316' },
            { label: 'Tasks',     value: `${tasks.length} Tasks`,    color: '#8B5CF6' },
          ].map(m => (
            <div key={m.label}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>{m.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}

          {allocated > 0 && (
            <div style={{ flex: 1, minWidth: 200, maxWidth: 360 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>
                <span>Budget Utilisation</span>
                <span style={{ fontWeight: 700, color: utilPct > 100 ? '#EF4444' : utilPct > 85 ? '#F59E0B' : '#10B981' }}>{utilPct}%</span>
              </div>
              <div style={{ height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(utilPct, 100)}%`, background: utilPct > 100 ? '#EF4444' : utilPct > 85 ? '#F59E0B' : '#4F6EF7' }} />
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="tabs-bar">
          {TABS.map((tab, i) => (
            <button key={tab} className={`tab-btn${activeTab === i ? ' active' : ''}`} onClick={() => setActiveTab(i)}>
              {tab}
              {i === 1 && items.length > 0 && ` (${items.length})`}
              {i === 2 && tasks.length > 0 && ` (${tasks.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 24, maxWidth: 1100 }}>
        {activeTab === 0 && <OverviewTab head={head} items={items} tasks={tasks} />}
        {activeTab === 1 && <ExpenseItemsTab headId={id} items={items} tasks={tasks} canEdit={canEdit} onRefresh={load} />}
        {activeTab === 2 && <TasksTab headId={id} items={items} tasks={tasks} canEdit={canEdit} onRefresh={load} onSelectTask={t => { setSelectedTask(t); setDrawerOpen(true); }} />}
        {activeTab === 3 && <ExecutionFlowTab tasks={tasks} />}
        {activeTab === 4 && <DocumentsTab headId={id} items={items} tasks={tasks} />}
      </div>

      {/* Task drawer */}
      <TaskDrawer task={selectedTask} items={items} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}