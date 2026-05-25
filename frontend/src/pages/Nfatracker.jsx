/**
 * pages/NFATracker.jsx — Zero MUI
 * NFA linked to Expense Head (required), Expense Item, Task (optional)
 * PDF upload with backend AI parsing + preview modal
 * FLOW: Select Hierarchy → Upload PDF → Parse → Preview Modal → Confirm
 *
 * FIX: handleCreate and handleConfirmPreview now use FormData (not JSON)
 *      so multer on the backend can parse them without 413 errors.
 *      Never set Content-Type on FormData — browser sets multipart boundary.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import './app.css';

const fmt   = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const tkn   = () => localStorage.getItem('token') || '';
const hj    = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tkn()}` });
const authH = () => ({ Authorization: `Bearer ${tkn()}` });

/* ── Shared Modal ────────────────────────────────────────── */
function Modal({ open, onClose, title, children, footer, large }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${large ? ' modal-lg' : ' modal-sm'}`} onClick={e => e.stopPropagation()}>
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

/* ── Hierarchy selectors ─────────────────────────────────── */
function HierarchySelectors({ expenseHeadId, setExpenseHeadId, expenseItemId, setExpenseItemId, taskId, setTaskId, expenseHeads }) {
  const [items, setItems] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    setExpenseItemId(''); setTaskId(''); setItems([]); setTasks([]);
    if (!expenseHeadId) return;
    fetch(`/api/expense-items?expenseHeadId=${expenseHeadId}`, { headers: authH() })
      .then(r => r.ok ? r.json() : []).then(setItems).catch(() => {});
  }, [expenseHeadId]);

  useEffect(() => {
    setTaskId(''); setTasks([]);
    if (!expenseItemId) return;
    fetch(`/api/tasks?expenseItemId=${expenseItemId}`, { headers: authH() })
      .then(r => r.ok ? r.json() : []).then(setTasks).catch(() => {});
  }, [expenseItemId]);

  return (
    <>
      <div className="field">
        <label>Expense Head *</label>
        <select value={expenseHeadId} onChange={e => setExpenseHeadId(e.target.value)} required>
          <option value="">— Select Expense Head —</option>
          {expenseHeads.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>
      {items.length > 0 && (
        <div className="field">
          <label>Expense Item <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
          <select value={expenseItemId} onChange={e => setExpenseItemId(e.target.value)}>
            <option value="">— None —</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      )}
      {tasks.length > 0 && (
        <div className="field">
          <label>Task <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
          <select value={taskId} onChange={e => setTaskId(e.target.value)}>
            <option value="">— None —</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
    </>
  );
}

export default function NFATracker() {
  const { user } = useAuth();
  const canEdit    = ['Admin', 'Finance', 'Requestor'].includes(user?.role);
  const canApprove = ['Admin', 'Approver', 'Finance'].includes(user?.role);

  const [list,         setList]         = useState([]);
  const [expenseHeads, setExpenseHeads] = useState([]);
  const [activeBudget, setActiveBudget] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [addOpen,      setAddOpen]      = useState(false);
  const [uploadOpen,   setUploadOpen]   = useState(false);
  const [previewOpen,  setPreviewOpen]  = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [preview,      setPreview]      = useState(null);
  const [error,        setError]        = useState('');

  // form state
  const [expenseHeadId, setExpenseHeadId] = useState('');
  const [expenseItemId, setExpenseItemId] = useState('');
  const [taskId,        setTaskId]        = useState('');
  const [nfaNumber,     setNfaNumber]     = useState('');
  const [title,         setTitle]         = useState('');
  const [description,   setDescription]   = useState('');
  const [amount,        setAmount]        = useState('');
  const [pdfUrl,        setPdfUrl]        = useState(null);
  const [pdfName,       setPdfName]       = useState('');
  const [uploading,     setUploading]     = useState(false);
  const [saving,        setSaving]        = useState(false);
  const fileRef = useRef(null);

  const loadBudgets = async () => {
    try {
      const r = await fetch('/api/budgets', { headers: authH() });
      if (r.ok) {
        const data = await r.json();
        const unique = data.filter((b, i, a) => a.findIndex(x => x.id === b.id) === i);
        if (unique.length) setActiveBudget(unique[0]);
      }
    } catch {}
  };

  const loadHeads = async (budgetId) => {
    if (!budgetId) return;
    try {
      const r = await fetch(`/api/expense-heads?budgetId=${budgetId}`, { headers: authH() });
      if (r.ok) setExpenseHeads(await r.json());
    } catch {}
  };

  const load = async () => {
    try {
      const r = await fetch('/api/nfa-tracker', { headers: authH() });
      if (r.ok) setList(await r.json());
    } catch {}
  };

  useEffect(() => {
    Promise.all([loadBudgets(), load()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeBudget) loadHeads(activeBudget.id);
  }, [activeBudget?.id]);

  const resetForm = () => {
    setExpenseHeadId(''); setExpenseItemId(''); setTaskId('');
    setNfaNumber(''); setTitle(''); setDescription(''); setAmount('');
    setPdfUrl(null); setPdfName(''); setError('');
  };

  /* ── PDF Upload with backend parsing ──────────────────── */
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!expenseHeadId) { setError('Please select an Expense Head first'); return; }

    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file',          file);
      form.append('expenseHeadId', expenseHeadId);
      if (expenseItemId) form.append('expenseItemId', expenseItemId);
      if (taskId)        form.append('taskId',        taskId);

      // authH() only — NO Content-Type, browser sets multipart boundary
      const r = await fetch('/api/nfa-tracker/upload', {
        method: 'POST',
        headers: authH(),
        body: form,
      });

      if (r.ok) {
        const data = await r.json();
        setPreview({
          ...data.preview,
          fileUrl:      data.fileUrl,
          fileName:     data.fileName,
          expenseHeadId,
          expenseItemId,
          taskId,
        });
        setPreviewOpen(true);
        setUploadOpen(false);
        if (fileRef.current) fileRef.current.value = '';
      } else {
        const d = await r.json().catch(() => ({ error: r.statusText }));
        setError(d.error || 'Upload failed');
      }
    } catch (err) {
      setError(err.message || 'Upload failed');
    }
    setUploading(false);
  };

  /* ── Confirm preview and save ─────────────────────────────
     FIX: use FormData not JSON so multer parses it correctly
     and pdfUrl (potentially large) never goes through express.json()
  ─────────────────────────────────────────────────────────── */
  const handleConfirmPreview = async () => {
    if (!preview) return;
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('expenseHeadId', preview.expenseHeadId || '');
      if (preview.expenseItemId) fd.append('expenseItemId', preview.expenseItemId);
      if (preview.taskId)        fd.append('taskId',        preview.taskId);
      fd.append('nfaNumber',   preview.nfaNumber   || '');
      fd.append('title',       preview.title       || '');
      fd.append('description', preview.description || '');
      fd.append('amount',      String(preview.amount ? parseFloat(preview.amount) : 0));
      if (preview.fileUrl)  fd.append('pdfUrl',  preview.fileUrl);
      if (preview.fileName) fd.append('pdfName', preview.fileName);

      // authH() only — NO Content-Type, browser sets multipart boundary
      const r = await fetch('/api/nfa-tracker', {
        method:  'POST',
        headers: authH(),
        body:    fd,
      });
      const data = await r.json().catch(() => ({ error: r.statusText }));
      if (!r.ok) throw new Error(data.error || data.errors?.[0]?.msg || `Error ${r.status}`);
      setPreviewOpen(false);
      setPreview(null);
      resetForm();
      load();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  /* ── Create (manual entry) ────────────────────────────────
     FIX: use FormData not JSON — same reason as above
  ─────────────────────────────────────────────────────────── */
  const handleCreate = async () => {
    if (!expenseHeadId || !nfaNumber || !title) {
      setError('Expense Head, NFA Number and Title are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('expenseHeadId', expenseHeadId);
      if (expenseItemId) fd.append('expenseItemId', expenseItemId);
      if (taskId)        fd.append('taskId',        taskId);
      fd.append('nfaNumber',   nfaNumber);
      fd.append('title',       title);
      fd.append('description', description || '');
      fd.append('amount',      String(parseFloat(amount) || 0));
      if (pdfUrl)  fd.append('pdfUrl',  pdfUrl);
      if (pdfName) fd.append('pdfName', pdfName);

      // authH() only — NO Content-Type, browser sets multipart boundary
      const r = await fetch('/api/nfa-tracker', {
        method:  'POST',
        headers: authH(),
        body:    fd,
      });
      const data = await r.json().catch(() => ({ error: r.statusText }));
      if (!r.ok) throw new Error(data.error || data.errors?.[0]?.msg || `Error ${r.status}`);
      setAddOpen(false);
      resetForm();
      load();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  /* ── Edit — JSON is fine here, no file involved ─────────── */
  const handleEditSave = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/nfa-tracker/${editTarget.id}`, {
        method:  'PATCH',
        headers: hj(),
        body: JSON.stringify({
          nfaNumber:   editTarget.nfaNumber,
          title:       editTarget.title,
          description: editTarget.description,
          amount:      parseFloat(editTarget.amount) || 0,
        }),
      });
      if (r.ok) { setEditTarget(null); load(); }
    } catch {}
    setSaving(false);
  };

  /* ── Approve / Reject — JSON is fine, no file ────────────── */
  const handleApprove = async (id, reject) => {
    try {
      await fetch(`/api/nfa-tracker/${id}/approve`, {
        method:  'POST',
        headers: hj(),
        body:    JSON.stringify({ reject: !!reject }),
      });
      load();
    } catch {}
  };

  /* ── Delete ──────────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const r = await fetch(`/api/nfa-tracker/${deleteTarget.id}`, {
        method:  'DELETE',
        headers: authH(),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Delete failed'); setDeleteTarget(null); return; }
      setDeleteTarget(null);
      load();
    } catch {}
  };

  /* ── Download all ────────────────────────────────────────── */
  const downloadAll = () => {
    list.filter(n => n.pdfUrl).forEach(n => {
      const a = document.createElement('a');
      a.href     = n.pdfUrl;
      a.download = n.pdfName || `NFA_${n.nfaNumber}.pdf`;
      a.click();
    });
  };

  const headName = id => expenseHeads.find(h => h.id === id)?.name || id || '—';

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">NFA Tracker</h1>
        <div className="btn-row">
          <button className="btn btn-ghost btn-sm" onClick={downloadAll}>↓ Download All</button>
          {canEdit && (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => setUploadOpen(true)}>↑ Upload PDF</button>
              <button className="btn btn-primary" onClick={() => { setAddOpen(true); resetForm(); }}>+ New NFA</button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="cards-row">
        {[
          { label: 'Total NFAs',      value: list.length,                                                                         color: '#4F6EF7' },
          { label: 'Approved',        value: list.filter(n => n.status === 'Approved').length,                                    color: '#10B981' },
          { label: 'Pending',         value: list.filter(n => n.status === 'Submitted' || n.status === 'Pending').length,         color: '#F59E0B' },
          { label: 'Approved Amount', value: fmt(list.reduce((s, n) => s + (n.approvedAmount || 0), 0)),                         color: '#8B5CF6' },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="card-label">{s.label}</div>
            <div className="card-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>NFA Number</th>
              <th>Title</th>
              <th>Expense Head</th>
              <th>Amount</th>
              <th>Approved Amt</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map(n => (
              <tr key={n.id}>
                <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4F6EF7' }}>{n.nfaNumber || '—'}</td>
                <td style={{ fontSize: 13 }}>{n.title}</td>
                <td style={{ fontSize: 12 }}>{headName(n.expenseHeadId)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(n.amount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#10B981' }}>
                  {n.approvedAmount ? fmt(n.approvedAmount) : <span style={{ color: '#CBD5E1' }}>—</span>}
                </td>
                <td>
                  <span className="chip" style={{
                    background: n.status === 'Approved'  ? '#D1FAE5'
                              : n.status === 'Rejected'  ? '#FEE2E2'
                              : (n.status === 'Submitted' || n.status === 'Pending') ? '#FEF3C7'
                              : '#F1F5F9',
                    color: n.status === 'Approved'  ? '#065F46'
                         : n.status === 'Rejected'  ? '#991B1B'
                         : (n.status === 'Submitted' || n.status === 'Pending') ? '#92400E'
                         : '#475569',
                  }}>{n.status || 'Draft'}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                    {canApprove && (n.status === 'Submitted' || n.status === 'Pending') && (
                      <>
                        <button className="btn btn-success btn-xs" onClick={() => handleApprove(n.id, false)}>✔ Approve</button>
                        <button className="btn btn-danger  btn-xs" onClick={() => handleApprove(n.id, true)}>✕ Reject</button>
                      </>
                    )}
                    <button className="btn-icon" onClick={() => setEditTarget({ ...n })} title="Edit">✏</button>
                    {n.pdfUrl && <a className="btn-icon" href={n.pdfUrl} download={n.pdfName || 'NFA.pdf'} title="Download">↓</a>}
                    {canEdit && <button className="btn-icon red" onClick={() => setDeleteTarget(n)} title="Delete">🗑</button>}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
                No NFAs yet. Click "+ New NFA" to create one.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Upload Modal ── */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload NFA PDF" large
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setUploadOpen(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm"
            disabled={!expenseHeadId || uploading || !fileRef.current?.files?.[0]}
            onClick={() => handleUpload({ target: { files: fileRef.current?.files } })}>
            {uploading ? 'Uploading & Parsing…' : 'Upload & Parse'}
          </button>
        </>}>
        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#1A1D23' }}>Step 1: Select Hierarchy</div>
          <HierarchySelectors
            expenseHeadId={expenseHeadId} setExpenseHeadId={setExpenseHeadId}
            expenseItemId={expenseItemId} setExpenseItemId={setExpenseItemId}
            taskId={taskId} setTaskId={setTaskId}
            expenseHeads={expenseHeads}
          />
        </div>

        <div style={{ padding: '12px 14px', background: expenseHeadId ? '#F8FAFF' : '#F1F5F9', borderRadius: 8, border: '1.5px solid #E2E8F0', opacity: expenseHeadId ? 1 : 0.6 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: expenseHeadId ? '#1A1D23' : '#94A3B8' }}>Step 2: Upload PDF</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" disabled={!expenseHeadId || uploading}
              onClick={() => fileRef.current?.click()}>
              {uploading ? 'Processing…' : pdfUrl ? '↑ Replace PDF' : '↑ Choose PDF'}
            </button>
            {fileRef.current?.files?.[0] && (
              <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>✔ {fileRef.current.files[0].name}</span>
            )}
          </div>
          {!expenseHeadId && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>Select an Expense Head above to enable upload</div>}
          <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }}
            onChange={e => handleUpload(e)} />
        </div>
      </Modal>

      {/* ── Preview Modal ── */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Review Parsed NFA" large
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => { setPreviewOpen(false); setPreview(null); }}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleConfirmPreview}
            disabled={saving || !preview?.nfaNumber || !preview?.title}>
            {saving ? 'Saving…' : 'Confirm & Save'}
          </button>
        </>}>
        {preview && (
          <>
            <div className="alert alert-success" style={{ marginBottom: 14 }}>
              ✔ PDF parsed successfully. Review and confirm the details below.
            </div>
            <div className="field">
              <label>NFA Number *</label>
              <input value={preview.nfaNumber || ''} onChange={e => setPreview({ ...preview, nfaNumber: e.target.value })} required />
            </div>
            <div className="field">
              <label>Title *</label>
              <input value={preview.title || ''} onChange={e => setPreview({ ...preview, title: e.target.value })} required />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={preview.description || ''} onChange={e => setPreview({ ...preview, description: e.target.value })} rows={3} />
            </div>
            <div className="field">
              <label>Requested Amount (₹)</label>
              <input type="number" min={0} step={0.01} value={preview.amount || ''}
                onChange={e => setPreview({ ...preview, amount: e.target.value })} />
            </div>
          </>
        )}
      </Modal>

      {/* ── Add Modal ── */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); resetForm(); }} title="New NFA" large
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => { setAddOpen(false); resetForm(); }}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleCreate}
            disabled={saving || !expenseHeadId || !nfaNumber || !title}>
            {saving ? 'Creating…' : 'Create NFA'}
          </button>
        </>}>
        {error && <div className="alert alert-error">{error}</div>}
        <HierarchySelectors
          expenseHeadId={expenseHeadId} setExpenseHeadId={setExpenseHeadId}
          expenseItemId={expenseItemId} setExpenseItemId={setExpenseItemId}
          taskId={taskId} setTaskId={setTaskId}
          expenseHeads={expenseHeads}
        />
        <div className="field"><label>NFA Number *</label><input value={nfaNumber} onChange={e => setNfaNumber(e.target.value)} placeholder="e.g. NFA/2026/001" /></div>
        <div className="field"><label>Title *</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief description of request" /></div>
        <div className="field"><label>Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
        <div className="field"><label>Requested Amount (₹)</label><input type="number" min={0} step={0.01} value={amount} onChange={e => setAmount(e.target.value)} /></div>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit NFA" small
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(null)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleEditSave} disabled={saving}>Save</button>
        </>}>
        {editTarget && <>
          <div className="field"><label>NFA Number</label><input value={editTarget.nfaNumber || ''} onChange={e => setEditTarget(t => ({ ...t, nfaNumber: e.target.value }))} /></div>
          <div className="field"><label>Title</label><input value={editTarget.title || ''} onChange={e => setEditTarget(t => ({ ...t, title: e.target.value }))} /></div>
          <div className="field"><label>Description</label><textarea value={editTarget.description || ''} onChange={e => setEditTarget(t => ({ ...t, description: e.target.value }))} /></div>
          <div className="field"><label>Amount (₹)</label><input type="number" min={0} value={editTarget.amount || ''} onChange={e => setEditTarget(t => ({ ...t, amount: e.target.value }))} /></div>
        </>}
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete NFA?" small
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
        </>}>
        <p style={{ margin: 0, fontSize: 13 }}>Delete NFA <strong>{deleteTarget?.nfaNumber}</strong>? This cannot be undone.</p>
        {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}
      </Modal>
    </div>
  );
}