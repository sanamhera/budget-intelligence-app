/**
 * pages/POTracker.jsx — Zero MUI
 * PO REQUIRES an Approved NFA (enforced frontend + backend)
 * Hierarchy: Expense Head → fetch Approved NFAs → create PO
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import './app.css';

const fmt   = v => `₹${Number(v||0).toLocaleString('en-IN')}`;
const tkn   = () => localStorage.getItem('token') || '';
const hj    = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tkn()}` });
const authH = () => ({ Authorization: `Bearer ${tkn()}` });

const PO_STATUSES = ['Draft','Issued','Partially Invoiced','Fully Invoiced','Closed','Cancelled'];

function Modal({ open, onClose, title, children, footer, large }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${large?' modal-lg':' modal-sm'}`} onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h2 className="modal-title">{title}</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export default function POTracker() {
  const { user } = useAuth();
  const canEdit  = ['Admin','Finance','Requestor'].includes(user?.role);

  const [list,         setList]         = useState([]);
  const [expenseHeads, setExpenseHeads] = useState([]);
  const [activeBudget, setActiveBudget] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [addOpen,      setAddOpen]      = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error,        setError]        = useState('');
  const [saving,       setSaving]       = useState(false);

  // form
  const [expenseHeadId, setExpenseHeadId] = useState('');
  const [approvedNFAs,  setApprovedNFAs]  = useState([]);
  const [nfaId,         setNfaId]         = useState('');
  const [nfaBlocked,    setNfaBlocked]    = useState(false);
  const [vendorName,    setVendorName]    = useState('');
  const [poNumber,      setPoNumber]      = useState('');
  const [amount,        setAmount]        = useState('');
  const [description,   setDescription]  = useState('');
  const [status,        setStatus]        = useState('Draft');
  const [pdfUrl,        setPdfUrl]        = useState(null);
  const [pdfName,       setPdfName]       = useState('');
  const [uploading,     setUploading]     = useState(false);
  const [aiMsg,         setAiMsg]         = useState('');
  const fileRef = useRef(null);

  // Expanded row state
  const [expanded, setExpanded] = useState({});

  const loadBudgets = async () => {
    try {
      const r = await fetch('/api/budgets', { headers: authH() });
      if (r.ok) {
        const data = await r.json();
        const unique = data.filter((b,i,a)=>a.findIndex(x=>x.id===b.id)===i);
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
      const r = await fetch('/api/pos', { headers: authH() });
      if (r.ok) setList(await r.json());
    } catch {}
  };

  useEffect(() => { Promise.all([loadBudgets(), load()]).finally(()=>setLoading(false)); }, []);
  useEffect(() => { if (activeBudget) loadHeads(activeBudget.id); }, [activeBudget?.id]);

  // When expense head changes — fetch approved NFAs
  useEffect(() => {
    setNfaId(''); setApprovedNFAs([]); setNfaBlocked(false);
    if (!expenseHeadId) return;
    fetch(`/api/nfa-tracker?expenseHeadId=${expenseHeadId}&status=Approved`, { headers: authH() })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setApprovedNFAs(data);
        setNfaBlocked(data.length === 0);
      })
      .catch(() => setNfaBlocked(true));
  }, [expenseHeadId]);

  const resetForm = () => {
    setExpenseHeadId(''); setNfaId(''); setApprovedNFAs([]); setNfaBlocked(false);
    setVendorName(''); setPoNumber(''); setAmount(''); setDescription(''); setStatus('Draft');
    setPdfUrl(null); setPdfName(''); setAiMsg(''); setError('');
  };

  /* ── PDF Upload + AI ─────────────────────────────────────── */
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setAiMsg('Uploading PDF…');
    try {
      const form = new FormData(); form.append('file', file);
      const r = await fetch('/api/pos/upload', { method:'POST', headers: authH(), body: form });
      if (r.ok) { const d = await r.json(); setPdfUrl(d.fileUrl); setPdfName(file.name); }
    } catch {}
    setAiMsg('AI reading document…');
    const rawText = await new Promise(res => {
      const reader = new FileReader();
      reader.onload = ev => { const bin = ev.target.result||''; const m=bin.match(/\(([^)\\]{2,120})\)/g)||[]; res(m.map(x=>x.slice(1,-1)).join(' ').slice(0,4000)||bin.slice(0,3000)); };
      reader.readAsBinaryString(file);
    });
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:200,
          messages:[{role:'user',content:'Extract PO number, vendor name, and amount in INR. Return ONLY JSON: {"poNumber":"<string or null>","vendorName":"<string or null>","amount":<number or null>}\n\n'+rawText}] }),
      });
      const d = await res.json();
      const parsed = JSON.parse((d.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim());
      if (parsed.poNumber  && !poNumber)   setPoNumber(parsed.poNumber);
      if (parsed.vendorName&& !vendorName) setVendorName(parsed.vendorName);
      if (parsed.amount    && !amount)     setAmount(String(parsed.amount));
      setAiMsg(parsed.poNumber||parsed.vendorName||parsed.amount
        ? `AI extracted: PO# ${parsed.poNumber||'—'}, Vendor: ${parsed.vendorName||'—'}, Amount: ${parsed.amount?fmt(parsed.amount):'—'}`
        : 'AI could not extract data. Please fill manually.');
    } catch { setAiMsg('AI extraction failed. Please fill manually.'); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  /* ── Create ──────────────────────────────────────────────── */
  const handleCreate = async () => {
    if (!expenseHeadId) { setError('Select an Expense Head.'); return; }
    if (!nfaId)         { setError('Select an Approved NFA.'); return; }
    if (!vendorName)    { setError('Vendor name is required.'); return; }
    if (!amount)        { setError('Amount is required.'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/pos', {
        method:'POST', headers: hj(),
        body: JSON.stringify({ expenseHeadId, nfaId, vendorName, poNumber, amount: parseFloat(amount), description, status, pdfUrl, pdfName }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || data.errors?.[0]?.msg || `Error ${r.status}`);
      setAddOpen(false); resetForm(); load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  /* ── Edit ────────────────────────────────────────────────── */
  const handleEditSave = async () => {
    if (!editTarget) return; setSaving(true);
    try {
      const r = await fetch(`/api/pos/${editTarget.id}`, {
        method:'PATCH', headers: hj(),
        body: JSON.stringify({ vendorName: editTarget.vendorName, poNumber: editTarget.poNumber, amount: parseFloat(editTarget.amount)||0, description: editTarget.description, status: editTarget.status }),
      });
      if (r.ok) { setEditTarget(null); load(); }
    } catch {}
    setSaving(false);
  };

  /* ── Delete ──────────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const r = await fetch(`/api/pos/${deleteTarget.id}`, { method:'DELETE', headers: authH() });
      const d = await r.json();
      if (!r.ok) { setError(d.error); setDeleteTarget(null); return; }
      setDeleteTarget(null); load();
    } catch {}
  };

  const downloadAll = () => list.filter(p=>p.pdfUrl).forEach(p=>{const a=document.createElement('a');a.href=p.pdfUrl;a.download=p.pdfName||`PO_${p.poNumber}.pdf`;a.click();});

  const totalVal      = list.reduce((s,p)=>s+(p.amount||0),0);
  const totalInvoiced = list.reduce((s,p)=>s+(p.invoices||[]).reduce((si,i)=>si+(i.amount||0)+(i.tax||0),0),0);
  const headName = id => expenseHeads.find(h=>h.id===id)?.name || '—';

  const STATUS_STYLE = {
    Draft:{background:'#F1F5F9',color:'#475569'}, Issued:{background:'#DBEAFE',color:'#1E40AF'},
    'Partially Invoiced':{background:'#FEF3C7',color:'#92400E'}, 'Fully Invoiced':{background:'#D1FAE5',color:'#065F46'},
    Closed:{background:'#E2E8F0',color:'#334155'}, Cancelled:{background:'#FEE2E2',color:'#991B1B'},
  };

  if (loading) return <div className="spinner-wrap"><div className="spinner"/></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">PO Tracker</h1>
        <div className="btn-row">
          <button className="btn btn-ghost btn-sm" onClick={downloadAll}>↓ Download All</button>
          {canEdit && <button className="btn btn-primary" onClick={()=>{setAddOpen(true);resetForm();}}>+ New PO</button>}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}<button onClick={()=>setError('')} style={{float:'right',background:'none',border:'none',cursor:'pointer'}}>✕</button></div>}

      <div className="cards-row">
        {[
          { label:'Total POs',      value: list.length,                         color:'#4F6EF7' },
          { label:'PO Value',       value: fmt(totalVal),                       color:'#8B5CF6' },
          { label:'Total Invoiced', value: fmt(totalInvoiced),                  color:'#F59E0B' },
          { label:'Open Value',     value: fmt(Math.max(0,totalVal-totalInvoiced)), color:'#10B981' },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="card-label">{s.label}</div>
            <div className="card-value" style={{color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{width:40}}/>
              <th>PO Number</th>
              <th>NFA Number</th>
              <th>Expense Head</th>
              <th>Vendor</th>
              <th style={{textAlign:'right'}}>Amount</th>
              <th>Status</th>
              <th style={{textAlign:'right'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map(po => {
              const invoices = po.invoices || [];
              const totalInv = invoices.reduce((s,i)=>s+(i.amount||0)+(i.tax||0),0);
              const isOpen   = expanded[po.id];
              const sStyle   = STATUS_STYLE[po.status] || STATUS_STYLE.Draft;
              return (
                <>
                  <tr key={po.id} style={{background:isOpen?'#F8FAFF':'#fff'}}>
                    <td><button className="expand-btn" onClick={()=>setExpanded(e=>({...e,[po.id]:!e[po.id]}))}>{isOpen?'▼':'▶'}</button></td>
                    <td style={{fontFamily:'monospace',fontWeight:700}}>{po.poNumber||'—'}</td>
                    <td style={{fontSize:12,color:'#4F6EF7',fontFamily:'monospace'}}>{po.nfaNumber||'—'}</td>
                    <td style={{fontSize:12}}>{headName(po.expenseHeadId)}</td>
                    <td style={{fontSize:13}}>{po.vendorName}</td>
                    <td style={{textAlign:'right',fontWeight:600}}>{fmt(po.amount)}</td>
                    <td><span className="chip" style={sStyle}>{po.status}</span></td>
                    <td style={{textAlign:'right'}}>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        <button className="btn-icon" onClick={()=>setEditTarget({...po})} title="Edit">✏</button>
                        {po.pdfUrl && <a className="btn-icon" href={po.pdfUrl} download={po.pdfName||'PO.pdf'} title="Download">↓</a>}
                        {canEdit && <button className="btn-icon red" onClick={()=>setDeleteTarget(po)} title="Delete">🗑</button>}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${po.id}-exp`}>
                      <td colSpan={8} style={{padding:0}}>
                        <div className="expanded-panel">
                          <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
                            <div style={{flex:1,minWidth:200}}>
                              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'#94A3B8',marginBottom:8}}>PO Details</div>
                              {po.description && <p style={{fontSize:13,color:'#64748B',margin:'0 0 8px'}}>{po.description}</p>}
                              <div style={{fontSize:12,color:'#64748B'}}>PO: <strong>{fmt(po.amount)}</strong> · Invoiced: <strong style={{color:totalInv>po.amount?'#EF4444':'#10B981'}}>{fmt(totalInv)}</strong> · Remaining: <strong>{fmt(Math.max(0,po.amount-totalInv))}</strong></div>
                            </div>
                            <div style={{flex:1,minWidth:240}}>
                              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'#94A3B8',marginBottom:8}}>Invoices ({invoices.length})</div>
                              {invoices.length===0 ? <span style={{fontSize:12,color:'#CBD5E1'}}>No invoices yet.</span>
                                : invoices.map(inv=>(
                                  <div key={inv.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:'1px dashed #E2E8F0'}}>
                                    <span style={{flex:1,fontSize:12,fontWeight:600}}>{inv.vendorName}{inv.invoiceNumber?` #${inv.invoiceNumber}`:''}</span>
                                    <span style={{fontSize:12,fontWeight:700,color:'#4F6EF7'}}>{fmt((inv.amount||0)+(inv.tax||0))}</span>
                                    <span className="chip" style={{fontSize:9,padding:'1px 5px',background:inv.status==='Paid'?'#D1FAE5':'#EFF6FF',color:inv.status==='Paid'?'#065F46':'#1D4ED8'}}>{inv.status||'Pending'}</span>
                                  </div>
                                ))
                              }
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {list.length===0 && <tr><td colSpan={8} style={{textAlign:'center',padding:'40px',color:'#94A3B8'}}>No POs yet. Click "+ New PO" to create one.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Add PO Modal */}
      <Modal open={addOpen} onClose={()=>{setAddOpen(false);resetForm();}} title="New Purchase Order" large
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={()=>{setAddOpen(false);resetForm();}}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={saving||!expenseHeadId||!nfaId||!vendorName||!amount}>
            {saving?'Creating…':'Create PO'}
          </button>
        </>}>
        {error && <div className="alert alert-error">{error}</div>}

        {/* PDF Upload */}
        <div style={{padding:'12px 14px',background:'#F8FAFF',borderRadius:8,border:'1.5px solid #E2E8F0',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>Upload PO PDF (optional — AI will extract data)</div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <button className="btn btn-outline btn-sm" disabled={uploading} onClick={()=>fileRef.current?.click()}>
              {uploading?'Processing…':pdfUrl?'↑ Replace PDF':'↑ Upload PDF'}
            </button>
            {pdfUrl && <span style={{fontSize:12,color:'#10B981',fontWeight:600}}>✔ {pdfName}</span>}
          </div>
          <input ref={fileRef} type="file" accept="application/pdf" style={{display:'none'}} onChange={handleFileSelect}/>
          {aiMsg && <div className={`alert ${aiMsg.includes('extracted')&&!aiMsg.includes('could not')?'alert-success':'alert-info'}`} style={{marginTop:8,padding:'5px 10px',fontSize:12}}>{aiMsg}</div>}
        </div>

        {/* Expense Head */}
        <div className="field">
          <label>Expense Head *</label>
          <select value={expenseHeadId} onChange={e=>setExpenseHeadId(e.target.value)} required>
            <option value="">— Select Expense Head —</option>
            {expenseHeads.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>

        {/* NFA — only after expense head selected */}
        {expenseHeadId && (
          <div className="field">
            <label>Approved NFA *</label>
            {nfaBlocked ? (
              <div className="alert alert-error" style={{padding:'8px 12px',fontSize:12}}>
                ⚠ No Approved NFA found for this Expense Head. NFA must be approved before raising a PO.
              </div>
            ) : (
              <select value={nfaId} onChange={e=>setNfaId(e.target.value)} required>
                <option value="">— Select NFA —</option>
                {approvedNFAs.map(n=><option key={n.id} value={n.id}>{n.nfaNumber} — {n.title}</option>)}
              </select>
            )}
          </div>
        )}

        <div className="field"><label>Vendor Name *</label><input value={vendorName} onChange={e=>setVendorName(e.target.value)}/></div>
        <div className="fields-2">
          <div className="field"><label>PO Number</label><input value={poNumber} onChange={e=>setPoNumber(e.target.value)} placeholder="e.g. PO/2026/001"/></div>
          <div className="field"><label>Status</label>
            <select value={status} onChange={e=>setStatus(e.target.value)}>
              {PO_STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label>PO Amount (₹) *</label><input type="number" min={0} step={0.01} value={amount} onChange={e=>setAmount(e.target.value)}/></div>
        <div className="field"><label>Description</label><textarea value={description} onChange={e=>setDescription(e.target.value)}/></div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editTarget} onClose={()=>setEditTarget(null)} title="Edit PO"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={()=>setEditTarget(null)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleEditSave} disabled={saving}>Save</button>
        </>}>
        {editTarget && <>
          <div className="field"><label>Vendor Name</label><input value={editTarget.vendorName||''} onChange={e=>setEditTarget(t=>({...t,vendorName:e.target.value}))}/></div>
          <div className="fields-2">
            <div className="field"><label>PO Number</label><input value={editTarget.poNumber||''} onChange={e=>setEditTarget(t=>({...t,poNumber:e.target.value}))}/></div>
            <div className="field"><label>Status</label>
              <select value={editTarget.status||'Draft'} onChange={e=>setEditTarget(t=>({...t,status:e.target.value}))}>
                {PO_STATUSES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Amount (₹)</label><input type="number" min={0} value={editTarget.amount||''} onChange={e=>setEditTarget(t=>({...t,amount:e.target.value}))}/></div>
          <div className="field"><label>Description</label><textarea value={editTarget.description||''} onChange={e=>setEditTarget(t=>({...t,description:e.target.value}))}/></div>
        </>}
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleteTarget} onClose={()=>setDeleteTarget(null)} title="Delete PO?" small
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={()=>setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
        </>}>
        <p style={{margin:0,fontSize:13}}>Delete PO <strong>{deleteTarget?.poNumber||deleteTarget?.id}</strong>?</p>
        {error && <div className="alert alert-error" style={{marginTop:8}}>{error}</div>}
      </Modal>
    </div>
  );
}