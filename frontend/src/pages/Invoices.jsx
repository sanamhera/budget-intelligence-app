/**
 * pages/Invoices.jsx — Zero MUI
 * Invoice links to Expense Head, optionally NFA and PO
 * PDF upload + AI parse (Gemini via backend) + manual create
 * Vendor autocomplete with auto-create
 */
import { useState, useEffect, useRef } from 'react';
import { api, auditLog } from '../api/client';
import { useAuth } from '../context/AuthContext';
import './app.css';

const FY  = 'FY 2026-27';
const fmt = v => `₹${Number(v||0).toLocaleString('en-IN')}`;
const tkn = () => localStorage.getItem('token') || '';
const h   = () => ({ Authorization: `Bearer ${tkn()}` });
const hj  = () => ({ ...h(), 'Content-Type': 'application/json' });

async function ensureVendor(name, extras={}) {
  if (!name?.trim()) return null;
  const r = await fetch('/api/vendors/auto-create', { method:'POST', headers: hj(), body: JSON.stringify({ name: name.trim(), ...extras }) });
  const json = await r.json();
  return r.ok ? json : null;
}

function Modal({ open, onClose, title, children, footer, large }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${large?' modal-lg':''}`} onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h2 className="modal-title">{title}</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function VendorAutocomplete({ vendors, value, onChange, onNameChange }) {
  const [inputVal, setInputVal] = useState('');
  const [showList, setShowList] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (value) { const v = vendors.find(v=>v.id===value); if (v) setInputVal(v.vendorCode?`${v.vendorCode} — ${v.name}`:v.name); }
    else if (!inputVal) setInputVal('');
  }, [value, vendors]);

  useEffect(() => {
    const handle = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowList(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const filtered = vendors.filter(v => !inputVal || v.name.toLowerCase().includes(inputVal.toLowerCase()) || (v.vendorCode||'').toLowerCase().includes(inputVal.toLowerCase())).slice(0,10);

  return (
    <div className="field" ref={wrapRef} style={{position:'relative'}}>
      <label>Vendor (select or type new)</label>
      <input value={inputVal}
        onChange={e=>{ setInputVal(e.target.value); onNameChange?.(e.target.value); onChange('',e.target.value); setShowList(true); }}
        onFocus={()=>setShowList(true)}
        placeholder="Type vendor name or code…" />
      {showList && filtered.length > 0 && (
        <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:200,background:'#fff',border:'1px solid #E2E8F0',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.1)',maxHeight:220,overflowY:'auto'}}>
          {filtered.map(v=>(
            <div key={v.id}
              onClick={()=>{ const l=v.vendorCode?`${v.vendorCode} — ${v.name}`:v.name; setInputVal(l); onChange(v.id,v.name); onNameChange?.(v.name); setShowList(false); }}
              style={{padding:'8px 12px',cursor:'pointer',fontSize:13,borderBottom:'1px solid #F1F5F9'}}
              onMouseEnter={e=>e.currentTarget.style.background='#F8FAFF'}
              onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
              {v.vendorCode && <span style={{fontFamily:'monospace',fontSize:11,color:'#0EA5A0',marginRight:8}}>{v.vendorCode}</span>}
              {v.name}
            </div>
          ))}
        </div>
      )}
      {!value && inputVal && <div style={{fontSize:11,color:'#94A3B8',marginTop:3}}>Vendor not in master — will be auto-created on save</div>}
    </div>
  );
}

/* ── Linked entity selectors (for Add/Edit) ──────────────── */
function LinkedSelectors({ expenseHeadId, setExpenseHeadId, expenseItemId, setExpenseItemId, taskId, setTaskId, nfaId, setNfaId, poId, setPoId, expenseHeads }) {
  const [items, setItems] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [nfas,  setNfas]  = useState([]);
  const [pos,   setPos]   = useState([]);

  useEffect(() => {
    setExpenseItemId(''); setTaskId(''); setNfaId(''); setPoId(''); setItems([]); setTasks([]); setNfas([]); setPos([]);
    if (!expenseHeadId) return;
    fetch(`/api/expense-items?expenseHeadId=${expenseHeadId}`, { headers: { Authorization: `Bearer ${tkn()}` } }).then(r=>r.ok?r.json():[]).then(setItems).catch(()=>{});
    fetch(`/api/nfa-tracker?expenseHeadId=${expenseHeadId}`,   { headers: { Authorization: `Bearer ${tkn()}` } }).then(r=>r.ok?r.json():[]).then(setNfas).catch(()=>{});
    fetch(`/api/pos?expenseHeadId=${expenseHeadId}`,           { headers: { Authorization: `Bearer ${tkn()}` } }).then(r=>r.ok?r.json():[]).then(setPos).catch(()=>{});
  }, [expenseHeadId]);

  useEffect(() => {
    setTaskId(''); setTasks([]);
    if (!expenseItemId) return;
    fetch(`/api/tasks?expenseItemId=${expenseItemId}`, { headers: { Authorization: `Bearer ${tkn()}` } }).then(r=>r.ok?r.json():[]).then(setTasks).catch(()=>{});
  }, [expenseItemId]);

  return (
    <>
      <div className="field">
        <label>Expense Head *</label>
        <select value={expenseHeadId} onChange={e=>setExpenseHeadId(e.target.value)} required>
          <option value="">— Select Expense Head —</option>
          {expenseHeads.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>
      {items.length > 0 && (
        <div className="field">
          <label>Expense Item <span style={{color:'#94A3B8',fontWeight:400}}>(optional)</span></label>
          <select value={expenseItemId} onChange={e=>setExpenseItemId(e.target.value)}>
            <option value="">— None —</option>
            {items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      )}
      {tasks.length > 0 && (
        <div className="field">
          <label>Task <span style={{color:'#94A3B8',fontWeight:400}}>(optional)</span></label>
          <select value={taskId} onChange={e=>setTaskId(e.target.value)}>
            <option value="">— None —</option>
            {tasks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
      {nfas.length > 0 && (
        <div className="field">
          <label>Linked NFA <span style={{color:'#94A3B8',fontWeight:400}}>(optional)</span></label>
          <select value={nfaId} onChange={e=>setNfaId(e.target.value)}>
            <option value="">— None —</option>
            {nfas.map(n=><option key={n.id} value={n.id}>{n.nfaNumber} — {n.title} [{n.status}]</option>)}
          </select>
        </div>
      )}
      {pos.length > 0 && (
        <div className="field">
          <label>Linked PO <span style={{color:'#94A3B8',fontWeight:400}}>(optional)</span></label>
          <select value={poId} onChange={e=>setPoId(e.target.value)}>
            <option value="">— None —</option>
            {pos.map(p=><option key={p.id} value={p.id}>{p.poNumber||'PO'} — {p.vendorName} ({fmt(p.amount)})</option>)}
          </select>
        </div>
      )}
    </>
  );
}

export default function Invoices() {
  const { user } = useAuth();
  const canAdd  = ['Admin','Requestor','Finance'].includes(user?.role);
  const canEdit = ['Admin','Finance'].includes(user?.role);

  const [invoices,    setInvoices]    = useState([]);
  const [expenseHeads,setExpenseHeads]= useState([]);
  const [activeBudget,setActiveBudget]= useState(null);
  const [glList,      setGlList]      = useState([]);
  const [vendors,     setVendors]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  const [addOpen,     setAddOpen]     = useState(false);
  const [uploadOpen,  setUploadOpen]  = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen,    setEditOpen]    = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);
  const [delOpen,     setDelOpen]     = useState(false);
  const [delTarget,   setDelTarget]   = useState(null);
  const [preview,     setPreview]     = useState(null);

  // form
  const [expenseHeadId,  setExpenseHeadId]  = useState('');
  const [expenseItemId,  setExpenseItemId]  = useState('');
  const [taskId,         setTaskId]         = useState('');
  const [nfaId,          setNfaId]          = useState('');
  const [poId,           setPoId]           = useState('');
  const [vendorId,       setVendorId]       = useState('');
  const [vendorRaw,      setVendorRaw]      = useState('');
  const [invNumber,      setInvNumber]      = useState('');
  const [amount,         setAmount]         = useState('');
  const [tax,            setTax]            = useState('');
  const [date,           setDate]           = useState('');
  const [dueDate,        setDueDate]        = useState('');
  const [glCode,         setGlCode]         = useState('');
  const [costCentre,     setCostCentre]     = useState('');
  const [uploading,           setUploading]           = useState(false);
  const [uploadBudId,         setUploadBudId]         = useState('');
  const [uploadExpenseHeadId, setUploadExpenseHeadId] = useState('');
  const [uploadExpenseItemId, setUploadExpenseItemId] = useState('');
  const [uploadTaskId,        setUploadTaskId]        = useState('');
  const [uploadItems,         setUploadItems]         = useState([]);
  const [uploadTasks,         setUploadTasks]         = useState([]);
  const [file,                setFile]                = useState(null);
  const [saving,              setSaving]              = useState(false);

  const loadBudgets = async () => {
    try {
      const r = await fetch('/api/budgets', { headers: h() });
      if (r.ok) { const d = await r.json(); const u = d.filter((b,i,a)=>a.findIndex(x=>x.id===b.id)===i); if (u.length) setActiveBudget(u[0]); }
    } catch {}
  };

  const loadHeads = async (budgetId) => {
    if (!budgetId) return;
    try { const r = await fetch(`/api/expense-heads?budgetId=${budgetId}`, { headers: h() }); if (r.ok) setExpenseHeads(await r.json()); } catch {}
  };

  const load = async () => {
    try {
      const [inv,gl,ven] = await Promise.all([
        fetch('/api/invoices', { headers: h() }).then(r=>r.ok?r.json():[]).catch(()=>[]),
        api.gl ? api.gl.list().catch(()=>[]) : Promise.resolve([]),
        fetch('/api/vendors',  { headers: h() }).then(r=>r.ok?r.json():[]).catch(()=>[]),
      ]);
      setInvoices(Array.isArray(inv)?inv:[]);
      setGlList(Array.isArray(gl)?gl:[]);
      setVendors(Array.isArray(ven)?ven:[]);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { Promise.all([loadBudgets(),load()]).finally(()=>setLoading(false)); }, []);
  useEffect(() => { if (activeBudget) loadHeads(activeBudget.id); }, [activeBudget?.id]);

  useEffect(() => {
    setUploadExpenseItemId(''); setUploadTaskId(''); setUploadItems([]); setUploadTasks([]);
    if (!uploadExpenseHeadId) return;
    fetch(`/api/expense-items?expenseHeadId=${uploadExpenseHeadId}`, { headers: h() })
      .then(r => r.ok ? r.json() : []).then(setUploadItems).catch(() => {});
  }, [uploadExpenseHeadId]);

  useEffect(() => {
    setUploadTaskId(''); setUploadTasks([]);
    if (!uploadExpenseItemId) return;
    fetch(`/api/tasks?expenseItemId=${uploadExpenseItemId}`, { headers: h() })
      .then(r => r.ok ? r.json() : []).then(setUploadTasks).catch(() => {});
  }, [uploadExpenseItemId]);

  const resolveVendor = inv => { if (inv.vendorId) return vendors.find(v=>v.id===inv.vendorId)?.name||inv.vendorName||'—'; return inv.vendorName||'—'; };
  const resolveVendorCode = inv => { if (inv.vendorId) return vendors.find(v=>v.id===inv.vendorId)?.vendorCode||''; return ''; };

  const resetForm = () => {
    setExpenseHeadId(''); setExpenseItemId(''); setTaskId(''); setNfaId(''); setPoId('');
    setVendorId(''); setVendorRaw(''); setInvNumber(''); setAmount(''); setTax('');
    setDate(''); setDueDate(''); setGlCode(''); setCostCentre(''); setError('');
  };

  /* ── Create ──────────────────────────────────────────────── */
  const handleCreate = async (e) => {
    e?.preventDefault(); setError('');
    if (!expenseHeadId) { setError('Expense Head is required.'); return; }
    setSaving(true);
    try {
      let vId = vendorId, vName = vendorRaw;
      if (!vId && vName.trim()) { const v = await ensureVendor(vName); if (v) { vId=v.id; vName=v.name; } }
      else if (vId) vName = vendors.find(v=>v.id===vId)?.name || vName;
      if (!vName) { setError('Vendor is required.'); setSaving(false); return; }

      const r = await fetch('/api/invoices', {
        method:'POST', headers: hj(),
        body: JSON.stringify({
          budgetId: activeBudget?.id, expenseHeadId, expenseItemId: expenseItemId||null,
          taskId: taskId||null, nfaId: nfaId||null, poId: poId||null,
          vendorId: vId||undefined, vendorName: vName,
          invoiceNumber: invNumber||undefined, amount: parseFloat(amount),
          tax: parseFloat(tax)||0, date: date||undefined, dueDate: dueDate||undefined,
          glCode: glCode||undefined, costCentre: costCentre.trim()||undefined,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error||'Failed'); }
      auditLog({ user, module:'Invoice', action:'Create', newValue:{vendorName:vName,amount:parseFloat(amount)} });
      setAddOpen(false); resetForm(); load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  /* ── Upload PDF ──────────────────────────────────────────── */
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file||!uploadBudId) return;
    setUploading(true);
    try {
      const res  = await api.invoices.upload(file, uploadBudId);
      const prev = { ...res.preview, glCode: res.preview?.lineItems?.[0]?.glCode||'',
        expenseHeadId: uploadExpenseHeadId,
        expenseItemId: uploadExpenseItemId || null,
        taskId:        uploadTaskId        || null,
        nfaId:'', poId:'' };
      if (prev.vendorName) { const m = vendors.find(v=>v.name.toLowerCase()===prev.vendorName.toLowerCase()); if (m) prev.vendorId=m.id; }
      setPreview(prev); setPreviewOpen(true);
      setUploadOpen(false); setFile(null); setUploadBudId('');
      setUploadExpenseHeadId(''); setUploadExpenseItemId(''); setUploadTaskId('');
      setUploadItems([]); setUploadTasks([]);
    } catch (e) { setError(e.message); }
    finally { setUploading(false); }
  };

  /* ── Confirm ─────────────────────────────────────────────── */
  const handleConfirm = async () => {
    let vId=preview.vendorId, vName=preview.vendorName;
    if (!vId&&vName) { const v=await ensureVendor(vName,{gstNumber:preview.gstNumber||'',address:preview.vendorAddress||'',phone:preview.vendorPhone||'',email:preview.vendorEmail||''}); if(v){vId=v.id;vName=v.name;} }
    await api.invoices.confirm({
      ...preview, vendorId:vId, vendorName:vName,
      lineItems: preview.lineItems?.length ? preview.lineItems : [{ description:'Invoice Allocation', amount:preview.amount, glCode:preview.glCode }],
    });
    auditLog({ user, module:'Invoice', action:'Create via Upload', newValue:{vendorName:vName,amount:preview.amount} });
    setPreviewOpen(false); setPreview(null); load();
  };

  /* ── Edit save ───────────────────────────────────────────── */
  const handleEditSave = async () => {
    setSaving(true);
    const r = await fetch(`/api/invoices/${editTarget.id}`, {
      method:'PATCH', headers: hj(),
      body: JSON.stringify({ vendorId:editTarget.vendorId||undefined, vendorName:editTarget.vendorName, invoiceNumber:editTarget.invoiceNumber, amount:Number(editTarget.amount), tax:Number(editTarget.tax)||0, date:editTarget.date, dueDate:editTarget.dueDate, glCode:editTarget.glCode, costCentre:editTarget.costCentre?.trim()||undefined }),
    });
    if (r.ok) { auditLog({user,module:'Invoice',action:'Edit',recordId:editTarget.id}); setEditOpen(false); setEditTarget(null); load(); }
    setSaving(false);
  };

  /* ── Delete ──────────────────────────────────────────────── */
  const handleDelete = async () => {
    await fetch(`/api/invoices/${delTarget.id}`,{method:'DELETE',headers:h()});
    auditLog({user,module:'Invoice',action:'Delete',recordId:delTarget.id});
    setDelOpen(false); setDelTarget(null); load();
  };

  const downloadAll = () => invoices.filter(i=>i.fileUrl||i.pdfUrl).forEach(i=>{const a=document.createElement('a');a.href=i.fileUrl||i.pdfUrl;a.download=`Invoice_${i.invoiceNumber||i.id}.pdf`;a.click();});

  if (loading) return <div className="spinner-wrap"><div className="spinner"/></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <div style={{fontSize:12,color:'#94A3B8',marginTop:2}}>{FY}</div>
        </div>
        {canAdd && (
          <div className="btn-row">
            <button className="btn btn-ghost btn-sm" onClick={downloadAll}>↓ Download All</button>
            <button className="btn btn-outline btn-sm" onClick={()=>setUploadOpen(true)}>↑ Upload PDF</button>
            <button className="btn btn-primary" onClick={()=>{setAddOpen(true);resetForm();}}>+ Add Invoice</button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}<button onClick={()=>setError('')} style={{float:'right',background:'none',border:'none',cursor:'pointer'}}>✕</button></div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Vendor</th>
              <th>Vendor Code</th>
              <th>PO Number</th>
              <th>NFA Number</th>
              <th style={{textAlign:'right'}}>Amount</th>
              <th style={{textAlign:'right'}}>Tax</th>
              <th>Date</th>
              <th>Cost Centre</th>
              <th>Status</th>
              <th style={{textAlign:'center'}}>Doc</th>
              {canEdit && <th style={{textAlign:'right'}}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {invoices.length===0 && <tr><td colSpan={canEdit?12:11} style={{textAlign:'center',padding:'40px',color:'#94A3B8'}}>No invoices found.</td></tr>}
            {invoices.map(i=>(
              <tr key={i.id}>
                <td style={{fontFamily:'monospace',fontSize:12,fontWeight:700}}>{i.invoiceNumber||'—'}</td>
                <td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:13}}>{resolveVendor(i)}</td>
                <td style={{fontFamily:'monospace',fontSize:11,color:'#0EA5A0'}}>{resolveVendorCode(i)||'—'}</td>
                <td style={{fontFamily:'monospace',fontSize:11}}>{i.poNumber||'—'}</td>
                <td style={{fontFamily:'monospace',fontSize:11,color:'#7C3AED'}}>{i.nfaNumber||'—'}</td>
                <td style={{textAlign:'right',fontWeight:600}}>{fmt(i.amount)}</td>
                <td style={{textAlign:'right',fontSize:12}}>{fmt(i.tax)}</td>
                <td style={{fontSize:12}}>{i.date||'—'}</td>
                <td style={{fontFamily:'monospace',fontSize:11,color:'#4338CA'}}>{i.costCentre||'—'}</td>
                <td>
                  <span className="chip" style={{
                    background:i.status==='Paid'?'#D1FAE5':i.status==='Partial'?'#DBEAFE':'#FEF3C7',
                    color:     i.status==='Paid'?'#065F46':i.status==='Partial'?'#1E40AF':'#92400E',
                  }}>{i.status||'Pending'}</span>
                </td>
                <td style={{textAlign:'center'}}>
                  {(i.fileUrl||i.pdfUrl)
                    ? <a className="btn-icon" style={{color:'#10B981'}} href={i.fileUrl||i.pdfUrl} target="_blank" rel="noreferrer" download={`Invoice_${i.invoiceNumber||i.id}.pdf`}>↓</a>
                    : <span style={{color:'#CBD5E1'}}>—</span>}
                </td>
                {canEdit && (
                  <td style={{textAlign:'right'}}>
                    <button className="btn-icon" onClick={()=>{setEditTarget({...i});setEditOpen(true);}}>✏</button>
                    <button className="btn-icon red" onClick={()=>{setDelTarget(i);setDelOpen(true);}}>🗑</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      <Modal open={addOpen} onClose={()=>{setAddOpen(false);resetForm();}} title={`Add Invoice — ${FY}`} large
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={()=>{setAddOpen(false);resetForm();}}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={saving||!expenseHeadId||!amount}>
            {saving?'Creating…':'Create Invoice'}
          </button>
        </>}>
        {error && <div className="alert alert-error">{error}</div>}

        <LinkedSelectors expenseHeadId={expenseHeadId} setExpenseHeadId={setExpenseHeadId} expenseItemId={expenseItemId} setExpenseItemId={setExpenseItemId} taskId={taskId} setTaskId={setTaskId} nfaId={nfaId} setNfaId={setNfaId} poId={poId} setPoId={setPoId} expenseHeads={expenseHeads} />

        <VendorAutocomplete vendors={vendors} value={vendorId} onChange={(id,name)=>{setVendorId(id);setVendorRaw(name);}} onNameChange={setVendorRaw}/>

        <div className="field"><label>Invoice Number</label><input value={invNumber} onChange={e=>setInvNumber(e.target.value)}/></div>
        <div className="fields-2">
          <div className="field"><label>Amount (₹) *</label><input type="number" min={0} step={0.01} value={amount} onChange={e=>setAmount(e.target.value)} required/></div>
          <div className="field"><label>Tax (₹)</label><input type="number" min={0} step={0.01} value={tax} onChange={e=>setTax(e.target.value)}/></div>
        </div>
        <div className="fields-2">
          <div className="field"><label>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div className="field"><label>Due Date</label><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div>
        </div>
        <div className="field"><label>Cost Centre</label><input value={costCentre} placeholder="e.g. CC-IT-001 (optional)" onChange={e=>setCostCentre(e.target.value)}/></div>
        {glList.length > 0 && (
          <div className="field"><label>GL Code</label>
            <select value={glCode} onChange={e=>setGlCode(e.target.value)}>
              <option value="">— None —</option>
              {glList.map(gl=><option key={gl.code} value={gl.code}>{gl.code} — {gl.name}</option>)}
            </select>
          </div>
        )}
      </Modal>

      {/* Upload Modal */}
      <Modal open={uploadOpen} onClose={()=>setUploadOpen(false)} title="Upload Invoice PDF" large
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={()=>setUploadOpen(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={!file||!uploadBudId||!uploadExpenseHeadId||uploading} onClick={handleUpload}>
            {uploading?'Uploading & Parsing…':'Upload & Parse'}
          </button>
        </>}>
        <div className="field"><label>Budget *</label>
          <select value={uploadBudId} onChange={e=>setUploadBudId(e.target.value)} required>
            <option value="">— Select —</option>
            {activeBudget && <option value={activeBudget.id}>{activeBudget.fy}</option>}
          </select>
        </div>
        <div className="field"><label>Expense Head *</label>
          <select value={uploadExpenseHeadId} onChange={e=>setUploadExpenseHeadId(e.target.value)} required>
            <option value="">— Select Expense Head —</option>
            {expenseHeads.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        {uploadItems.length > 0 && (
          <div className="field"><label>Expense Item <span style={{color:'#94A3B8',fontWeight:400}}>(optional)</span></label>
            <select value={uploadExpenseItemId} onChange={e=>setUploadExpenseItemId(e.target.value)}>
              <option value="">— None —</option>
              {uploadItems.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        )}
        {uploadTasks.length > 0 && (
          <div className="field"><label>Task <span style={{color:'#94A3B8',fontWeight:400}}>(optional)</span></label>
            <select value={uploadTaskId} onChange={e=>setUploadTaskId(e.target.value)}>
              <option value="">— None —</option>
              {uploadTasks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        <div className="field"><label>PDF File *</label>
          <input type="file" accept="application/pdf" onChange={e=>setFile(e.target.files[0])}/>
          {file && <div style={{fontSize:12,color:'#64748B',marginTop:4}}>Selected: {file.name}</div>}
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal open={previewOpen} onClose={()=>setPreviewOpen(false)} title="Review Parsed Invoice" large
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={()=>setPreviewOpen(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleConfirm}>Confirm & Save</button>
        </>}>
        {preview && (<>
          <div className={`alert ${preview.vendorId?'alert-success':'alert-info'}`} style={{marginBottom:14}}>
            {preview.vendorId?'Vendor matched from master.':'Vendor not in master — will be auto-created on confirm.'}
          </div>
          {preview.expenseHeadId && (
            <div style={{marginBottom:12,padding:'8px 12px',background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:6,fontSize:12,color:'#166534'}}>
              Linked to: <strong>{expenseHeads.find(h=>h.id===preview.expenseHeadId)?.name || preview.expenseHeadId}</strong>
            </div>
          )}
          <div className="field"><label>Vendor Name</label><input value={preview.vendorName||''} onChange={e=>setPreview({...preview,vendorName:e.target.value,vendorId:''})}/></div>
          <div className="field"><label>Invoice Number</label><input value={preview.invoiceNumber||''} onChange={e=>setPreview({...preview,invoiceNumber:e.target.value})}/></div>
          <div className="fields-2">
            <div className="field"><label>Amount (₹)</label><input type="number" value={preview.amount||0} onChange={e=>setPreview({...preview,amount:parseFloat(e.target.value)})}/></div>
            <div className="field"><label>Tax (₹)</label><input type="number" value={preview.tax||0} onChange={e=>setPreview({...preview,tax:parseFloat(e.target.value)})}/></div>
          </div>
          <div className="fields-2">
            <div className="field"><label>Date</label><input type="date" value={preview.date||''} onChange={e=>setPreview({...preview,date:e.target.value})}/></div>
            <div className="field"><label>Due Date</label><input type="date" value={preview.dueDate||''} onChange={e=>setPreview({...preview,dueDate:e.target.value})}/></div>
          </div>
        </>)}
      </Modal>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={()=>{setEditOpen(false);setEditTarget(null);}} title={`Edit Invoice — ${editTarget?.invoiceNumber||editTarget?.id||''}`} large
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={()=>{setEditOpen(false);setEditTarget(null);}}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleEditSave} disabled={saving}>Save Changes</button>
        </>}>
        {editTarget && (<>
          <div className="field"><label>Vendor Name</label><input value={editTarget.vendorName||''} onChange={e=>setEditTarget(t=>({...t,vendorName:e.target.value}))}/></div>
          <div className="field"><label>Invoice Number</label><input value={editTarget.invoiceNumber||''} onChange={e=>setEditTarget(t=>({...t,invoiceNumber:e.target.value}))}/></div>
          <div className="fields-2">
            <div className="field"><label>Amount (₹)</label><input type="number" value={editTarget.amount||''} onChange={e=>setEditTarget(t=>({...t,amount:parseFloat(e.target.value)}))}/></div>
            <div className="field"><label>Tax (₹)</label><input type="number" value={editTarget.tax||''} onChange={e=>setEditTarget(t=>({...t,tax:parseFloat(e.target.value)}))}/></div>
          </div>
          <div className="fields-2">
            <div className="field"><label>Date</label><input type="date" value={editTarget.date||''} onChange={e=>setEditTarget(t=>({...t,date:e.target.value}))}/></div>
            <div className="field"><label>Due Date</label><input type="date" value={editTarget.dueDate||''} onChange={e=>setEditTarget(t=>({...t,dueDate:e.target.value}))}/></div>
          </div>
          <div className="field"><label>Cost Centre</label><input value={editTarget.costCentre||''} placeholder="Optional" onChange={e=>setEditTarget(t=>({...t,costCentre:e.target.value}))}/></div>
          {glList.length>0 && <div className="field"><label>GL Code</label>
            <select value={editTarget.glCode||''} onChange={e=>setEditTarget(t=>({...t,glCode:e.target.value}))}>
              <option value="">— None —</option>
              {glList.map(gl=><option key={gl.code} value={gl.code}>{gl.code} — {gl.name}</option>)}
            </select>
          </div>}
        </>)}
      </Modal>

      {/* Delete Modal */}
      <Modal open={delOpen} onClose={()=>setDelOpen(false)} title="Delete Invoice?"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={()=>setDelOpen(false)}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
        </>}>
        <p style={{margin:0,fontSize:13}}>Delete invoice <strong>#{delTarget?.invoiceNumber||delTarget?.id||''}</strong>? Cannot be undone.</p>
      </Modal>
    </div>
  );
}