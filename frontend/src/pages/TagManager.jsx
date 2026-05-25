import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import '../pages/app.css';

const tkn   = () => localStorage.getItem('token') || '';
const hj    = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tkn()}` });
const authH = () => ({ Authorization: `Bearer ${tkn()}` });

const COLORS = [
  '#1976d2','#388e3c','#f57c00','#d32f2f','#7b1fa2',
  '#0288d1','#00796b','#afb42b','#5d4037','#455a64',
  '#c2185b','#512da8','#0097a7','#558b2f','#e64a19',
];
const COLOR_NAMES = {
  '#1976d2':'Blue','#388e3c':'Green','#f57c00':'Orange','#d32f2f':'Red',
  '#7b1fa2':'Purple','#0288d1':'Light Blue','#00796b':'Teal','#afb42b':'Lime',
  '#5d4037':'Brown','#455a64':'Blue Grey','#c2185b':'Pink','#512da8':'Deep Purple',
  '#0097a7':'Cyan','#558b2f':'Olive','#e64a19':'Deep Orange',
};

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
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

export default function TagManager() {
  const { user } = useAuth();
  const canEdit  = ['Admin','Finance'].includes(user?.role);

  const [tags,        setTags]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [dialog,      setDialog]      = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [name,        setName]        = useState('');
  const [color,       setColor]       = useState(COLORS[0]);
  const [saving,      setSaving]      = useState(false);
  const [formErr,     setFormErr]     = useState('');
  const [deleteTarget,setDeleteTarget]= useState(null);
  const [deleting,    setDeleting]    = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/tags', { headers: authH() });
      if (r.ok) setTags(await r.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setName(''); setColor(COLORS[0]); setFormErr(''); setDialog(true); };
  const openEdit   = (tag) => { setEditing(tag); setName(tag.name); setColor(tag.color || COLORS[0]); setFormErr(''); setDialog(true); };

  const handleSave = async () => {
    if (!name.trim()) { setFormErr('Tag name is required'); return; }
    setSaving(true); setFormErr('');
    try {
      const body = JSON.stringify({ name: name.trim(), color });
      const r = editing
        ? await fetch(`/api/tags/${editing.id}`, { method:'PATCH', headers: hj(), body })
        : await fetch('/api/tags',                { method:'POST',  headers: hj(), body });
      if (r.status === 409) { setFormErr('A tag with this name already exists'); setSaving(false); return; }
      if (!r.ok)            { setFormErr('Save failed. Please try again.');       setSaving(false); return; }
      setDialog(false); load();
    } catch { setFormErr('Save failed.'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/tags/${deleteTarget.id}`, { method:'DELETE', headers: authH() });
    } catch { setError('Delete failed.'); }
    setDeleting(false); setDeleteTarget(null); load();
  };

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tag Manager</h1>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'#64748B' }}>
            Create and manage tags. Tags can be applied to expense heads, items and tasks.
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openCreate}>+ New Tag</button>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom:16 }}>{error} <button onClick={() => setError('')} style={{ float:'right', background:'none', border:'none', cursor:'pointer' }}>✕</button></div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th>Color</th>
              <th>Name</th>
              {canEdit && <th style={{ textAlign:'right' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {tags.map(tag => (
              <tr key={tag.id}>
                <td>
                  <span className="tag-chip"
                    style={{ background: tag.color+'22', color: tag.color, border:`1px solid ${tag.color}55` }}>
                    {tag.name}
                  </span>
                </td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:16, height:16, borderRadius:'50%', background: tag.color, display:'inline-block', flexShrink:0 }} />
                    <span style={{ fontSize:12, color:'#64748B' }}>{COLOR_NAMES[tag.color] || tag.color}</span>
                  </div>
                </td>
                <td style={{ fontSize:13 }}>{tag.name}</td>
                {canEdit && (
                  <td style={{ textAlign:'right' }}>
                    <button className="btn-icon" onClick={() => openEdit(tag)} title="Edit">✏️</button>
                    <button className="btn-icon red" onClick={() => setDeleteTarget(tag)} title="Delete">🗑️</button>
                  </td>
                )}
              </tr>
            ))}
            {tags.length === 0 && (
              <tr><td colSpan={canEdit ? 4 : 3} style={{ textAlign:'center', padding:'40px', color:'#94A3B8' }}>
                No tags yet. Click "New Tag" to create one.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit */}
      <Modal open={dialog} onClose={() => setDialog(false)}
        title={editing ? 'Edit Tag' : 'New Tag'}
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setDialog(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Tag'}
          </button>
        </>}>
        {formErr && <div className="alert alert-error">{formErr}</div>}
        <div className="field">
          <label>Tag name *</label>
          <input value={name} autoFocus onChange={e => { setName(e.target.value); setFormErr(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSave()} />
        </div>
        <div className="field">
          <label>Pick a colour</label>
          <div className="color-row">
            {COLORS.map(c => (
              <div key={c} title={COLOR_NAMES[c]}
                className={`color-swatch${color === c ? ' selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'#F8FAFC', borderRadius:8, marginTop:8 }}>
          <span style={{ fontSize:12, color:'#94A3B8' }}>Preview:</span>
          <span className="tag-chip" style={{ background: color+'22', color, border:`1px solid ${color}55` }}>
            {name || 'Tag name'}
          </span>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        title="Delete Tag?"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </>}>
        <div style={{ marginBottom:12 }}>
          <span className="tag-chip" style={{ background: deleteTarget?.color+'22', color: deleteTarget?.color, border:`1px solid ${deleteTarget?.color}55` }}>
            {deleteTarget?.name}
          </span>
        </div>
        <p style={{ margin:0, fontSize:13, color:'#374151' }}>
          This tag will be removed from all items it is applied to. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}