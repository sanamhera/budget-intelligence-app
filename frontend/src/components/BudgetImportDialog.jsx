import { useState, useRef } from 'react';
import '../pages/app.css';

const tkn   = () => localStorage.getItem('token') || '';
const authH = () => ({ Authorization: `Bearer ${tkn()}` });
const hj    = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tkn()}` });
const fmt   = v => `₹${Number(v||0).toLocaleString('en-IN')}`;

function Modal({ open, onClose, title, children, footer, large }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${large ? 'modal-lg' : ''}`} onClick={e => e.stopPropagation()}>
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

function RowActionToggle({ action, onChange, hasError }) {
  if (hasError) return <span className="chip chip-red" style={{ fontSize:10 }}>Skip (errors)</span>;
  return (
    <div className="toggle-group" style={{ width:220 }}>
      {[
        { v:'create', label:'Create new',     active:'chip-green'  },
        { v:'update', label:'Update existing', active:'chip-blue'   },
        { v:'skip',   label:'Skip',           active:'chip-gray'   },
      ].map(opt => (
        <button key={opt.v} className={`toggle-btn ${action===opt.v ? 'active' : ''}`}
          style={{ fontSize:10, padding:'4px 6px' }}
          onClick={() => onChange(opt.v)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function BudgetImportDialog({ onImportComplete }) {
  const [open,    setOpen]    = useState(false);
  const [stage,   setStage]   = useState('idle');
  const [rows,    setRows]    = useState([]);
  const [summary, setSummary] = useState(null);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState('');
  const fileRef = useRef(null);

  const reset = () => { setStage('idle'); setRows([]); setSummary(null); setResult(null); setError(''); };
  const handleClose = () => { setOpen(false); setTimeout(reset, 300); };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setError(''); setStage('uploading');
    const form = new FormData(); form.append('file', file);
    try {
      const r = await fetch('/api/budgets/import/preview', { method:'POST', headers: authH(), body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Preview failed');
      setRows(data.rows.map(row => ({ ...row, action: row.errors?.length ? 'skip' : row.conflict ? 'conflict' : 'create' })));
      setSummary({ totalRows: data.totalRows, validRows: data.validRows, conflictRows: data.conflictRows, errorRows: data.errorRows });
      setStage('preview');
    } catch (err) { setError(err.message); setStage('idle'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const setRowAction  = (idx, action) => setRows(prev => prev.map(r => r.rowIndex===idx ? { ...r, action } : r));
  const setAllConflicts = (action) => setRows(prev => prev.map(r => r.conflict && !r.errors?.length ? { ...r, action } : r));

  const handleConfirm = async () => {
    setStage('confirming'); setError('');
    try {
      const r = await fetch('/api/budgets/import/confirm', { method:'POST', headers: hj(), body: JSON.stringify({ rows }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Import failed');
      setResult(data); setStage('done'); onImportComplete?.();
    } catch (err) { setError(err.message); setStage('preview'); }
  };

  const toCreate = rows.filter(r => r.action==='create').length;
  const toUpdate = rows.filter(r => r.action==='update').length;
  const toSkip   = rows.filter(r => r.action==='skip' || r.action==='conflict').length;

  return (
    <>
      <button className="btn btn-outline" onClick={() => setOpen(true)}>↑ Import Excel</button>

      <Modal open={open} onClose={handleClose} large
        title="Import Budgets from Excel"
        footer={
          stage === 'idle' ? <button className="btn btn-ghost btn-sm" onClick={handleClose}>Cancel</button>
          : stage === 'preview' ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => { setStage('idle'); setRows([]); setSummary(null); }}>← Choose different file</button>
              <button className="btn btn-ghost btn-sm" onClick={handleClose}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={toCreate+toUpdate === 0}>
                Confirm Import ({toCreate+toUpdate} rows)
              </button>
            </>
          )
          : stage === 'done' ? <button className="btn btn-primary btn-sm" onClick={handleClose}>Close</button>
          : null
        }>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          {stage === 'preview' && summary && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <span className="chip chip-blue">{summary.totalRows} rows parsed</span>
              <span className="chip chip-green">{summary.validRows} valid</span>
              <span className="chip chip-yellow">{summary.conflictRows} conflicts</span>
              <span className="chip chip-red">{summary.errorRows} errors</span>
            </div>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft:'auto' }}
            onClick={() => window.open('/api/budgets/import/template','_blank')}>↓ Download Template</button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {stage === 'idle' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20, padding:'40px 24px', border:'2px dashed #CBD5E1', borderRadius:12, background:'#FAFBFF', textAlign:'center' }}>
            <div style={{ fontSize:48 }}>📊</div>
            <div>
              <div style={{ fontWeight:600, fontSize:16, marginBottom:4 }}>Select your filled Excel template</div>
              <div style={{ fontSize:13, color:'#64748B' }}>.xlsx or .xls format · max 10 MB · up to 200 rows</div>
            </div>
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>↑ Choose File</button>
            <span style={{ fontSize:12, color:'#94A3B8' }}>
              Don't have the template?{' '}
              <span style={{ color:'#4F6EF7', cursor:'pointer', textDecoration:'underline' }}
                onClick={() => window.open('/api/budgets/import/template','_blank')}>
                Download it here
              </span>
            </span>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleFileChange} />
          </div>
        )}

        {stage === 'uploading' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, padding:'60px' }}>
            <div className="spinner" />
            <div style={{ fontSize:13, color:'#64748B' }}>Parsing Excel file…</div>
          </div>
        )}

        {stage === 'preview' && rows.length > 0 && (
          <>
            {summary?.conflictRows > 0 && (
              <div className="alert alert-warn" style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:12 }}>
                <span style={{ fontWeight:600 }}>⚠ {summary.conflictRows} row{summary.conflictRows>1?'s':''} match existing budget names. Set all to:</span>
                <button className="btn btn-ghost btn-xs" onClick={() => setAllConflicts('create')}>+ Create new</button>
                <button className="btn btn-ghost btn-xs" onClick={() => setAllConflicts('update')}>✏ Update</button>
                <button className="btn btn-ghost btn-xs" onClick={() => setAllConflicts('skip')}>– Skip all</button>
              </div>
            )}
            <div style={{ overflowX:'auto' }}>
              <table style={{ minWidth:800 }}>
                <thead>
                  <tr>
                    <th style={{ width:32 }} />
                    <th style={{ minWidth:180 }}>Name</th>
                    <th style={{ textAlign:'right', minWidth:110 }}>Allocated</th>
                    <th style={{ minWidth:90 }}>Function</th>
                    <th style={{ minWidth:80 }}>Type</th>
                    <th style={{ minWidth:80 }}>NFA</th>
                    <th style={{ minWidth:120 }}>Tags</th>
                    <th style={{ minWidth:260 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.rowIndex}
                      style={{ background: row.errors?.length ? '#FFF5F5' : row.conflict ? '#FFFBEB' : '#fff', opacity: row.action==='skip' ? 0.5 : 1 }}>
                      <td style={{ textAlign:'center' }}>
                        {row.errors?.length ? '❌' : row.conflict ? '⚠️' : '✅'}
                      </td>
                      <td>
                        <div style={{ fontWeight:600, fontSize:13 }}>{row.name}</div>
                        {row.errors?.map((e,i) => <div key={i} style={{ fontSize:11, color:'#EF4444' }}>{e}</div>)}
                        {row.conflict && !row.errors?.length && <div style={{ fontSize:11, color:'#F59E0B' }}>Existing: {fmt(row.existingAllocated)}</div>}
                      </td>
                      <td className="td-right">{fmt(row.allocated)}</td>
                      <td style={{ fontSize:12, color:'#64748B' }}>{row.function || '—'}</td>
                      <td>
                        {row.budgetType
                          ? <span className={`chip ${row.budgetType==='Capex'?'chip-purple':'chip-blue'}`}>{row.budgetType}</span>
                          : <span style={{ color:'#CBD5E1', fontSize:12 }}>—</span>}
                      </td>
                      <td>
                        <span className={`chip ${row.nfaRequired==='yes'?'chip-purple':'chip-green'}`} style={{ fontSize:10 }}>
                          {row.nfaRequired==='yes' ? 'Required' : 'No'}
                        </span>
                      </td>
                      <td>
                        {(row.tagNames||[]).slice(0,3).map(t => <span key={t} className="chip chip-blue" style={{ fontSize:9, marginRight:2 }}>{t}</span>)}
                        {(row.tagNames||[]).length > 3 && <span style={{ fontSize:10, color:'#94A3B8' }}>+{row.tagNames.length-3}</span>}
                      </td>
                      <td>
                        <RowActionToggle action={row.action} hasError={!!row.errors?.length} onChange={a => setRowAction(row.rowIndex, a)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:12, padding:'10px 14px', background:'#F8FAFC', borderRadius:8, alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ fontSize:13, color:'#64748B' }}>Ready to import:</span>
              <span className="chip chip-green">{toCreate} new</span>
              <span className="chip chip-blue">{toUpdate} update</span>
              <span className="chip chip-gray">{toSkip} skipped</span>
            </div>
          </>
        )}

        {stage === 'confirming' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, padding:'60px' }}>
            <div className="spinner" />
            <div style={{ fontSize:13, color:'#64748B' }}>Saving budgets to Firestore…</div>
          </div>
        )}

        {stage === 'done' && result && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20, padding:'40px', textAlign:'center' }}>
            <div style={{ fontSize:56 }}>✅</div>
            <div style={{ fontWeight:700, fontSize:18 }}>Import complete!</div>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap', justifyContent:'center' }}>
              {[
                { label:'Created', value: result.created, color:'#10B981' },
                { label:'Updated', value: result.updated, color:'#4F6EF7' },
                { label:'Skipped', value: result.skipped, color:'#94A3B8' },
              ].map(s => (
                <div key={s.label} style={{ padding:'16px 24px', border:'1px solid #E2E8F0', borderRadius:10, minWidth:80 }}>
                  <div style={{ fontSize:28, fontWeight:700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize:12, color:'#94A3B8' }}>{s.label}</div>
                </div>
              ))}
            </div>
            {result.errors?.length > 0 && (
              <div className="alert alert-warn" style={{ width:'100%' }}>
                {result.errors.length} row{result.errors.length>1?'s':''} failed: {result.errors.map(e=>e.name).join(', ')}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}