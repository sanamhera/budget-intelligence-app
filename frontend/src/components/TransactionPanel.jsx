import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import '../pages/app.css';

const fmt   = v => `₹${Number(v||0).toLocaleString('en-IN')}`;
const tkn   = () => localStorage.getItem('token') || '';
const hj    = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tkn()}` });
const authH = () => ({ Authorization: `Bearer ${tkn()}` });

const PO_STATUSES = ['Draft','Issued','Partially Invoiced','Fully Invoiced','Closed','Cancelled'];

const STATUS_STYLE = {
  Approved: { background:'#D1FAE5', color:'#065F46' },
  Submitted:{ background:'#DBEAFE', color:'#1E40AF' },
  Rejected: { background:'#FEE2E2', color:'#991B1B' },
  Pending:  { background:'#FEF3C7', color:'#92400E' },
  Draft:    { background:'#F1F5F9', color:'#475569' },
  Issued:   { background:'#DBEAFE', color:'#1E40AF' },
  Paid:     { background:'#D1FAE5', color:'#065F46' },
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

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.Draft;
  return <span className="chip" style={{ ...style, fontSize:9, padding:'2px 7px' }}>{status || 'Pending'}</span>;
}

function TxCard({ tx, onDelete, canEdit }) {
  const handleDownload = () => {
    if (!tx.fileUrl) return;
    const a = document.createElement('a'); a.href = tx.fileUrl; a.download = tx.fileName || 'document.pdf'; a.click();
  };
  return (
    <div style={{ padding:'8px 10px', marginBottom:6, border:'1px solid #E2E8F0', borderRadius:8, background:'#fff' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:12 }}>{tx.vendorName || '—'}</div>
          {tx.description && <div style={{ fontSize:11, color:'#64748B' }}>{tx.description}</div>}
          <div style={{ display:'flex', gap:6, marginTop:3, alignItems:'center', flexWrap:'wrap' }}>
            {tx.amount > 0 && <span style={{ fontSize:11, fontWeight:700, color:'#4F6EF7' }}>{fmt(tx.amount)}</span>}
            <StatusBadge status={tx.status} />
            {tx.fileName && <span style={{ fontSize:10, color:'#94A3B8' }}>📎 {tx.fileName}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:3, flexShrink:0 }}>
          {tx.fileUrl && <button className="btn-icon" onClick={handleDownload} title="Download">↓</button>}
          {canEdit && <button className="btn-icon red" onClick={() => onDelete(tx)} title="Remove">✕</button>}
        </div>
      </div>
    </div>
  );
}

function NFAUploadCard({ entityId, entityType, onSaved }) {
  const [uploading, setUploading] = useState(false);
  const [aiMsg,     setAiMsg]     = useState('');
  const [pendingTx, setPendingTx] = useState(null);
  const [manualAmt, setManualAmt] = useState('');
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setAiMsg('✨ AI reading document…');
    const fileUrl = await new Promise(res => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.readAsDataURL(file); });
    const rawText = await new Promise(res => {
      const reader = new FileReader();
      reader.onload = ev => {
        const bin = ev.target.result;
        const matches = bin.match(/\(([^)]{4,200})\)/g) || [];
        const text = matches.map(m => m.slice(1,-1)).join(' ');
        res(text.length > 50 ? text : bin.slice(0, 5000));
      };
      reader.readAsBinaryString(file);
    });
    let extractedAmount = null;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:200,
          messages:[{role:'user', content:'Extract the approved NFA/budget amount in INR. Return ONLY valid JSON: {"amount": <number or null>}\n\n'+rawText.slice(0,4000)}] }),
      });
      const d = await res.json();
      extractedAmount = JSON.parse((d.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim()).amount || null;
    } catch {}
    try {
      const r = await fetch('/api/transactions', {
        method:'POST', headers:hj(),
        body: JSON.stringify({ type:'NFA', entityId, entityType, amount: extractedAmount||0, description: file.name, fileUrl, fileName: file.name, status:'Submitted' }),
      });
      if (r.ok) {
        const tx = await r.json();
        if (extractedAmount) { setAiMsg(`AI extracted: ${fmt(extractedAmount)}`); onSaved(); }
        else { setAiMsg('AI could not find an amount. Enter it manually.'); setPendingTx(tx); }
      }
    } catch {}
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleManualAmount = async () => {
    const val = parseFloat(manualAmt); if (!val || !pendingTx) return;
    try {
      await fetch(`/api/transactions/${pendingTx.id}`, { method:'PATCH', headers:hj(), body: JSON.stringify({ amount: val }) });
      setAiMsg(`${fmt(val)} saved.`); setPendingTx(null); setManualAmt(''); onSaved();
    } catch {}
  };

  return (
    <div>
      <button className="btn btn-outline btn-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>↑ Upload NFA PDF</button>
      <input ref={fileRef} type="file" accept="application/pdf" style={{ display:'none' }} onChange={handleFile} />
      {uploading && <div style={{ fontSize:11, color:'#94A3B8', marginTop:4 }}>{aiMsg}</div>}
      {!uploading && aiMsg && <div className={`alert ${pendingTx?'alert-info':'alert-success'}`} style={{ marginTop:4, padding:'4px 10px', fontSize:11 }}>{aiMsg}</div>}
      {pendingTx && (
        <div style={{ display:'flex', gap:6, marginTop:6, alignItems:'center' }}>
          <input type="number" value={manualAmt} onChange={e => setManualAmt(e.target.value)} placeholder="Amount (₹)" style={{ width:140, padding:'5px 8px', border:'1.5px solid #E2E8F0', borderRadius:6, fontSize:12, outline:'none' }} />
          <button className="btn btn-outline btn-xs" disabled={!manualAmt} onClick={handleManualAmount}>Save</button>
        </div>
      )}
    </div>
  );
}

function POSection({ po, canEdit, onDelete, onInvoiceAdded }) {
  const [open,     setOpen]     = useState(false);
  const [invOpen,  setInvOpen]  = useState(false);
  const [invoices, setInvoices] = useState(po.invoices || []);
  const [form,     setForm]     = useState({ vendorName:'', invoiceNumber:'', amount:'', tax:'', date:'' });

  const handleAddInvoice = async () => {
    if (!form.vendorName || !form.amount) return;
    try {
      const r = await fetch(`/api/pos/${po.id}/invoices`, { method:'POST', headers:hj(), body: JSON.stringify({ ...form, amount: parseFloat(form.amount), tax: parseFloat(form.tax)||0 }) });
      if (r.ok) { const u = await r.json(); setInvoices(u.invoices||[]); onInvoiceAdded?.(); }
    } catch {}
    setInvOpen(false); setForm({ vendorName:'', invoiceNumber:'', amount:'', tax:'', date:'' });
  };

  return (
    <div style={{ padding:'8px 10px', marginBottom:6, border:'1px solid #E2E8F0', borderRadius:8, background:'#fff' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, cursor:'pointer' }} onClick={() => setOpen(o=>!o)}>
          <button className="expand-btn" style={{ fontSize:11 }}>{open ? '▼' : '▶'}</button>
          <div>
            <div style={{ fontWeight:700, fontSize:12 }}>{po.vendorName}{po.poNumber ? ` — PO #${po.poNumber}` : ''}</div>
            <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:2 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#4F6EF7' }}>{fmt(po.amount)}</span>
              <StatusBadge status={po.status} />
              {invoices.length > 0 && <span className="chip chip-green" style={{ fontSize:8, padding:'1px 5px' }}>{invoices.length} invoice{invoices.length>1?'s':''}</span>}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:3 }}>
          {po.pdfUrl && <a className="btn-icon" href={po.pdfUrl} download={po.pdfName||'PO.pdf'} title="Download PDF">↓</a>}
          {canEdit && <button className="btn-icon" onClick={() => setInvOpen(true)} title="Add invoice">+</button>}
          {canEdit && <button className="btn-icon red" onClick={() => onDelete(po)} title="Remove PO">✕</button>}
        </div>
      </div>
      {open && (
        <div style={{ marginTop:8, marginLeft:20 }}>
          {invoices.length === 0
            ? <span style={{ fontSize:11, color:'#CBD5E1' }}>No invoices yet.</span>
            : invoices.map(inv => (
              <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', borderBottom:'1px dashed #E2E8F0' }}>
                <span style={{ flex:1, fontSize:11 }}>{inv.vendorName}{inv.invoiceNumber ? ` #${inv.invoiceNumber}` : ''}</span>
                <span style={{ fontSize:11, fontWeight:700, color:'#4F6EF7' }}>{fmt((inv.amount||0)+(inv.tax||0))}</span>
                <StatusBadge status={inv.status} />
              </div>
            ))
          }
        </div>
      )}
      <Modal open={invOpen} onClose={() => setInvOpen(false)} title="Add Invoice to PO"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setInvOpen(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleAddInvoice} disabled={!form.vendorName || !form.amount}>Add</button>
        </>}>
        <div className="field"><label>Vendor Name *</label><input value={form.vendorName} autoFocus onChange={e => setForm(f=>({...f,vendorName:e.target.value}))} /></div>
        <div className="field"><label>Invoice Number</label><input value={form.invoiceNumber} onChange={e => setForm(f=>({...f,invoiceNumber:e.target.value}))} /></div>
        <div className="fields-2">
          <div className="field"><label>Amount (₹) *</label><input type="number" min={0} value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))} /></div>
          <div className="field"><label>Tax (₹)</label><input type="number" min={0} value={form.tax} onChange={e => setForm(f=>({...f,tax:e.target.value}))} /></div>
        </div>
        <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e => setForm(f=>({...f,date:e.target.value}))} /></div>
      </Modal>
    </div>
  );
}

export default function TransactionPanel({ entityId, entityType }) {
  const { user } = useAuth();
  const canEdit  = ['Admin','Finance','Requestor'].includes(user?.role);
  const [transactions, setTransactions] = useState(null);
  const [pos,          setPos]          = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [poOpen,       setPoOpen]       = useState(false);
  const [txOpen,       setTxOpen]       = useState(false);
  const [poForm,       setPoForm]       = useState({ vendorName:'', poNumber:'', amount:'', status:'Draft' });
  const [txForm,       setTxForm]       = useState({ type:'INVOICE', vendorName:'', amount:'', description:'', status:'Pending' });
  const [deleteTx,     setDeleteTx]     = useState(null);
  const [deletePo,     setDeletePo]     = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [txR, poR] = await Promise.all([
        fetch(`/api/transactions?entityId=${entityId}`, { headers: authH() }),
        fetch(`/api/pos?entityId=${entityId}`,          { headers: authH() }),
      ]);
      if (txR.ok) setTransactions(await txR.json());
      if (poR.ok) setPos(await poR.json());
    } catch {}
    setLoading(false);
  }, [entityId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreatePO = async () => {
    if (!poForm.vendorName || !poForm.amount) return;
    try {
      await fetch('/api/pos', { method:'POST', headers:hj(), body: JSON.stringify({ ...poForm, amount: parseFloat(poForm.amount), entityId, entityType }) });
      setPoOpen(false); setPoForm({ vendorName:'', poNumber:'', amount:'', status:'Draft' }); loadData();
    } catch {}
  };

  const handleCreateTx = async () => {
    if (!txForm.vendorName) return;
    try {
      await fetch('/api/transactions', { method:'POST', headers:hj(), body: JSON.stringify({ ...txForm, amount: parseFloat(txForm.amount)||0, entityId, entityType }) });
      setTxOpen(false); setTxForm({ type:'INVOICE', vendorName:'', amount:'', description:'', status:'Pending' }); loadData();
    } catch {}
  };

  const handleDeleteTx = async () => { if (!deleteTx) return; try { await fetch(`/api/transactions/${deleteTx.id}`, { method:'DELETE', headers:authH() }); } catch {} setDeleteTx(null); loadData(); };
  const handleDeletePo = async () => { if (!deletePo) return; try { await fetch(`/api/pos/${deletePo.id}`,          { method:'DELETE', headers:authH() }); } catch {} setDeletePo(null); loadData(); };

  if (loading) return <div style={{ fontSize:12, color:'#94A3B8', padding:'8px 0' }}>Loading…</div>;

  const nfaTx = (transactions||[]).filter(t => t.type==='NFA');
  const invTx = (transactions||[]).filter(t => t.type==='INVOICE');
  const payTx = (transactions||[]).filter(t => t.type==='PAYMENT');

  return (
    <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
      {/* NFA */}
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#94A3B8', marginBottom:8 }}>📄 NFA ({nfaTx.length})</div>
        {nfaTx.map(tx => <TxCard key={tx.id} tx={tx} canEdit={canEdit} onDelete={setDeleteTx} />)}
        {canEdit && <div style={{ marginTop:4 }}><NFAUploadCard entityId={entityId} entityType={entityType} onSaved={loadData} /></div>}
        {nfaTx.length === 0 && !canEdit && <span style={{ fontSize:11, color:'#CBD5E1' }}>No NFA documents.</span>}
      </div>

      {/* POs */}
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#94A3B8' }}>📄 POs ({pos.length})</div>
          {canEdit && <button className="btn btn-ghost btn-xs" onClick={() => setPoOpen(true)}>+ Add PO</button>}
        </div>
        {pos.map(po => <POSection key={po.id} po={po} canEdit={canEdit} onDelete={setDeletePo} onInvoiceAdded={loadData} />)}
        {pos.length === 0 && <span style={{ fontSize:11, color:'#CBD5E1' }}>No POs yet.</span>}
      </div>

      {/* Invoices & Payments */}
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#94A3B8' }}>📄 Invoices/Payments ({invTx.length+payTx.length})</div>
          {canEdit && <button className="btn btn-ghost btn-xs" onClick={() => setTxOpen(true)}>+ Add</button>}
        </div>
        {[...invTx, ...payTx].map(tx => <TxCard key={tx.id} tx={tx} canEdit={canEdit} onDelete={setDeleteTx} />)}
        {invTx.length === 0 && payTx.length === 0 && <span style={{ fontSize:11, color:'#CBD5E1' }}>No invoices or payments.</span>}
      </div>

      {/* Modals */}
      <Modal open={poOpen} onClose={() => setPoOpen(false)} title="Add Purchase Order"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setPoOpen(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleCreatePO} disabled={!poForm.vendorName||!poForm.amount}>Create PO</button>
        </>}>
        <div className="field"><label>Vendor Name *</label><input value={poForm.vendorName} autoFocus onChange={e => setPoForm(f=>({...f,vendorName:e.target.value}))} /></div>
        <div className="field"><label>PO Number</label><input value={poForm.poNumber} onChange={e => setPoForm(f=>({...f,poNumber:e.target.value}))} /></div>
        <div className="field"><label>PO Amount (₹) *</label><input type="number" min={0} value={poForm.amount} onChange={e => setPoForm(f=>({...f,amount:e.target.value}))} /></div>
        <div className="field"><label>Status</label><select value={poForm.status} onChange={e => setPoForm(f=>({...f,status:e.target.value}))}>{PO_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
      </Modal>

      <Modal open={txOpen} onClose={() => setTxOpen(false)} title="Add Invoice / Payment"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setTxOpen(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleCreateTx} disabled={!txForm.vendorName}>Add</button>
        </>}>
        <div className="field"><label>Type</label><select value={txForm.type} onChange={e => setTxForm(f=>({...f,type:e.target.value}))}><option>INVOICE</option><option>PAYMENT</option></select></div>
        <div className="field"><label>Vendor Name *</label><input value={txForm.vendorName} autoFocus onChange={e => setTxForm(f=>({...f,vendorName:e.target.value}))} /></div>
        <div className="field"><label>Amount (₹)</label><input type="number" min={0} value={txForm.amount} onChange={e => setTxForm(f=>({...f,amount:e.target.value}))} /></div>
        <div className="field"><label>Description / Invoice No.</label><input value={txForm.description} onChange={e => setTxForm(f=>({...f,description:e.target.value}))} /></div>
      </Modal>

      <Modal open={!!deleteTx} onClose={() => setDeleteTx(null)} title="Remove Document?"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTx(null)}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={handleDeleteTx}>Remove</button>
        </>}>
        <p style={{ margin:0, fontSize:13 }}>Remove <strong>{deleteTx?.vendorName}</strong> ({deleteTx?.type})?</p>
      </Modal>

      <Modal open={!!deletePo} onClose={() => setDeletePo(null)} title="Delete PO?"
        footer={<>
          <button className="btn btn-ghost btn-sm" onClick={() => setDeletePo(null)}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={handleDeletePo}>Delete</button>
        </>}>
        <p style={{ margin:0, fontSize:13 }}>Delete PO from <strong>{deletePo?.vendorName}</strong>? All invoices will also be removed.</p>
      </Modal>
    </div>
  );
}