import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Standard label helper
const nodeTypeLabel = t => t === 'head' ? 'Expense Head' : t === 'item' ? 'Expense Item' : 'Task';

/* ─────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────── */
const fmt   = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmtSh = v => {
  const n = Number(v || 0);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`;
  return fmt(n);
};
const pct   = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
const tkn   = () => localStorage.getItem('token') || '';
const hj    = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tkn()}` });
const authH = () => ({ Authorization: `Bearer ${tkn()}` });

const FN_OPTIONS   = ['Finance','IT','Operations','HR','Legal','Marketing','Supply Chain','Engineering'];
const CAT_OPTIONS  = ['Application','Infrastructure','Data','Security','Compliance','Operations'];
const SPEND_CAT    = ['Run','Change'];
const INV_TYPE     = ['Maintenance','Enhancement','New Development'];
const BUDGET_TYPES = ['Capex','Opex'];

// TAG PALETTE — warm/vibrant, no UI-blue overlap
const TAG_PALETTE = ['#7C3AED','#DB2777','#EA580C','#D97706','#059669','#0D9488','#DC2626','#9333EA','#0891B2','#65A30D'];

// Hash tag name → consistent non-blue display color
const CHIP_PALETTE = ['#7C3AED','#DB2777','#EA580C','#D97706','#059669','#0D9488','#DC2626','#9333EA','#0891B2','#65A30D'];
const tagColor = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  return CHIP_PALETTE[Math.abs(h) % CHIP_PALETTE.length];
};

const ROW_GRID = '1fr 165px 215px 235px 56px 76px';
const INDENT_PER_DEPTH = 36;

/* ─────────────────────────────────────────────────────────────
   ICONS
   ───────────────────────────────────────────────────────────── */
const Ico = {
  ChevR:  () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  ChevD:  () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>,
  Edit:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>,
  Del:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>,
  Grid:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  Plus:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Close:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Tag:    () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/></svg>,
};
  
/* ─────────────────────────────────────────────────────────────
   FINANCIAL AGGREGATION
   ───────────────────────────────────────────────────────────── */
function aggregateNode(node) {
  const directTasks = node.directTasks || [];
  const items       = node.expenseItems || [];

  // Item level: Fix for Broadband (11L) vs Task sum (20L)
  const enrichedItems = items.map(item => {
    const itemTasks = item.tasks || [];
    const taskSpent = itemTasks.reduce((s, t) => s + (t.spent || 0), 0);
    return {
      ...item,
      _alloc: item.allocated || 0,   // ALWAYS prioritize Item budget
      _spent: itemTasks.length > 0 ? taskSpent : (item.spent || 0)
    };
  });

  // Head level: sum items + direct tasks
  const fi = enrichedItems.reduce((s, i) => ({ a: s.a + i._alloc, sp: s.sp + i._spent }), { a: 0, sp: 0 });
  const fd = directTasks.reduce((s, t) => ({ a: s.a + (t.allocated||0), sp: s.sp + (t.spent||0) }), { a: 0, sp: 0 });

  const sumField = (field, n) => {
    let c = n[field] || n.executionStatus?.[field] || 0;
    (n.tasks || []).forEach(t => { c += t[field] || t.executionStatus?.[field] || 0; });
    (n.directTasks || []).forEach(t => { c += t[field] || t.executionStatus?.[field] || 0; });
    (n.expenseItems || []).forEach(i => {
      c += i[field] || i.executionStatus?.[field] || 0;
      (i.tasks || []).forEach(t => { c += t[field] || t.executionStatus?.[field] || 0; });
    });
    return c;
  };

  return {
    ...node,
    _alloc:     node.allocated || 0,   // Head keeps its own budget
    _reserved:  fi.a + fd.a,           // Sum of children for envelope check
    _spent:     fi.sp + fd.sp,
    _items:     enrichedItems,
    _nfa:       sumField('nfaCount',     node),
    _po:        sumField('poCount',      node),
    _inv:       sumField('invoiceCount', node),
  };
}
/* ─────────────────────────────────────────────────────────────
   TAG CHIP — color-tinted label style (GitHub/Linear inspired)
   ───────────────────────────────────────────────────────────── */
const hexToRgba = (hex, alpha) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

function TagChip({ tag, onRemove }) {
  if (!tag) return null;
  const color  = tagColor(tag.name);
  const bg     = hexToRgba(color, 0.10);
  const border = hexToRgba(color, 0.25);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        height: 18,
        padding: '0 6px',
        borderRadius: 20,
        background: bg,
        border: `1px solid ${border}`,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        cursor: 'default',
        transition: 'filter 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.9)'; }}
      onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color, lineHeight: 1, letterSpacing: '0.02em', fontFamily: "'DM Sans',sans-serif" }}>
        {tag.name}
      </span>
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{ background: 'none', border: 'none', padding: 0, marginLeft: 1, cursor: 'pointer', color, fontSize: 13, lineHeight: 1, opacity: 0.45, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.45'; }}
          title="Remove tag"
        >×</button>
      )}
    </span>
  );
}
/* ─────────────────────────────────────────────────────────────
   TAG INPUT — Fast dropdown, all tags shown immediately, optimistic updates
   ───────────────────────────────────────────────────────────── */
function TagInput({ entityType, entityId, currentTagIds, allTags, onSaved, onTagCreated, onOpenChange }) {
  const [input,  setInput]  = useState('');
  const [open,   setOpen]   = useState(false);
  const wrapRef = useRef(null);
  const inRef   = useRef(null);

  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useEffect(() => { onOpenChange?.(open); }, [open]);

  useEffect(() => {
    if (!open) return;
    const fn = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setInput(''); } };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  useEffect(() => {
    if (open) {
      if (wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 6,
          left: rect.left
        });
      }
      setTimeout(() => inRef.current?.focus(), 10);
    }
  }, [open]);

  const endpointMap = { expenseHead: 'expense-heads', expenseItem: 'expense-items', task: 'tasks' };

  const applyTag = async (tagId, existing) => {
    const next = existing.includes(tagId) ? existing : [...existing, tagId];
    
    // Optimistic update - update UI immediately
    onSaved(next);
    setInput('');
    setOpen(false);
    
    // Then sync backend
    try {
      await fetch(`/api/${endpointMap[entityType]}/${entityId}`, {
        method: 'PATCH', 
        headers: hj(), 
        body: JSON.stringify({ tagIds: next }),
      });
    } catch (err) {
      console.error('Tag sync failed:', err);
    }
  };

  const createAndApply = async () => {
    const name = input.trim(); 
    if (!name) return;
    
    const hit = allTags.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (hit) { 
      applyTag(hit.id, currentTagIds); 
      return; 
    }
    
    try {
      const color = TAG_PALETTE[allTags.length % TAG_PALETTE.length];
      const r   = await fetch('/api/tags', { 
        method: 'POST', 
        headers: hj(), 
        body: JSON.stringify({ name, color }) 
      });
      const tag = await r.json();
      if (r.ok) { 
        onTagCreated(tag); 
        await applyTag(tag.id, currentTagIds); 
      }
    } catch (err) {
      console.error('Create tag failed:', err);
    }
  };

  // Show all tags when empty input, filter when typing
  const filtered = allTags.filter(t => !currentTagIds.includes(t.id) && (!input || t.name.toLowerCase().includes(input.toLowerCase())));
  const showCreate = input.trim() && !allTags.find(t => t.name.toLowerCase() === input.trim().toLowerCase());

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Add tag"
        style={{
          height: 18, padding: '0 5px', borderRadius: 3,
          border: '1px dashed #C4C9D4', background: 'transparent',
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2,
          color: '#9BA3B2', fontSize: 10, fontWeight: 500, flexShrink: 0, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor='#6366F1'; e.currentTarget.style.color='#6366F1'; e.currentTarget.style.background='#EEF2FF'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='#C4C9D4'; e.currentTarget.style.color='#9BA3B2'; e.currentTarget.style.background='transparent'; }}
      >
        <span style={{ fontSize: 12, lineHeight: 1 }}>+</span> tag
      </button>

      {open && (
        <div style={{ 
          position: 'fixed', 
          top: dropdownPos.top, 
          left: dropdownPos.left, 
          zIndex: 9999, 
          background: '#fff', 
          border: '1px solid #E2E8F0', 
          borderRadius: 8, 
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)', 
          padding: 8, 
          minWidth: 220, 
          maxHeight: 320, 
          overflowY: 'auto',
          pointerEvents: 'auto',
        }}>
          <input 
            ref={inRef} 
            value={input} 
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { 
                e.preventDefault(); 
                showCreate ? createAndApply() : (filtered.length ? applyTag(filtered[0].id, currentTagIds) : null); 
              }
              if (e.key === 'Escape') { setOpen(false); setInput(''); }
            }}
            placeholder="Search tags…"
            style={{ 
              width: '100%', 
              border: '1px solid #E2E8F0', 
              borderRadius: 6, 
              padding: '6px 8px', 
              fontSize: 12, 
              outline: 'none', 
              marginBottom: 6, 
              boxSizing: 'border-box', 
              fontWeight: 500 
            }}
            onFocus={e => e.currentTarget.style.borderColor='#4F46E5'}
            onBlur={e => e.currentTarget.style.borderColor='#E2E8F0'}
          />
          
          {/* Available tags */}
          {filtered.length > 0 && (
            <div style={{ marginBottom: showCreate ? 8 : 0 }}>
              {filtered.map(tag => (
                <div 
                  key={tag.id} 
                  onClick={() => { applyTag(tag.id, currentTagIds); }}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    padding: '6px 8px', 
                    borderRadius: 6, 
                    cursor: 'pointer', 
                    fontSize: 12, 
                    fontWeight: 500, 
                    transition: 'all 0.15s' 
                  }}
                  onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                  {tag.name}
                </div>
              ))}
            </div>
          )}
          
          {/* Create new tag */}
          {showCreate && (
            <div 
              onClick={createAndApply}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                padding: '6px 8px', 
                borderRadius: 6, 
                cursor: 'pointer', 
                fontSize: 12, 
                color: '#fff', 
                fontWeight: 600, 
                background: '#6366F1', 
                transition: 'all 0.2s', 
                borderTop: filtered.length ? '1px solid #E2E8F0' : 'none', 
                marginTop: filtered.length ? 6 : 0 
              }}
              onMouseEnter={e => e.currentTarget.style.background='#4338CA'}
              onMouseLeave={e => e.currentTarget.style.background='#4F46E5'}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>+</span> Create "{input.trim()}"
            </div>
          )}
          
          {/* Empty state */}
          {!filtered.length && !showCreate && (
            <div style={{ fontSize: 12, color: '#94A3B8', padding: '10px 8px', textAlign: 'center', fontWeight: 500 }}>
              No tags available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ENVELOPE SYSTEM HELPERS
   ───────────────────────────────────────────────────────────── */
const getEnvelopeMetrics = (node) => {
  const totalBudget = Number(node.allocated || 0);
  const reserved    = node._reserved != null
    ? node._reserved
    : (node.expenseItems || []).reduce((s, i) => s + (Number(i.allocated) || 0), 0)
      + (node.directTasks || []).reduce((s, t) => s + (Number(t.allocated) || 0), 0);
  const spent        = node._spent || 0;
  const available    = totalBudget - reserved;
  const rawPct       = totalBudget > 0 ? (reserved / totalBudget) * 100 : 0;
  const reservedPct  = Math.min(100, Math.round(rawPct));
  const displayPct   = Math.round(rawPct);
  // "Unbudgeted spend" only appears when actual spend exceeds the head's budget, not on allocation alone
  const isOverBudget = totalBudget > 0 && spent > totalBudget;
  const overAmount   = Math.max(0, spent - totalBudget);

  let status = 'normal';
  if (totalBudget > 0) {
    if (rawPct >= 100)  status = 'full';
    else if (rawPct >= 90) status = 'warning';
  }

  return { totalBudget, reserved, spent, available, reservedPct, displayPct, isOverBudget, overAmount, status };
};

const getEnvelopeBarColor = (status) => {
  switch(status) {
    case 'full':    return '#7C3AED';
    case 'warning': return '#F59E0B';
    default:        return '#10B981';
  }
};

/* ─────────────────────────────────────────────────────────────
   TREE ROW — Column order: Name/Tags | Financials | Allocation | Execution | Workspace | Actions
   ───────────────────────────────────────────────────────────── */
function TreeRow({ node, depth, nodeType, allTags, localTags, canEdit, onTagUpdate, onTagCreated, onEdit, onDelete, onOpen, onQuickAdd }) {
  const [expanded,      setExpanded]      = useState(depth === 0);
  const [hovered,       setHovered]       = useState(false);
  const [tagInputOpen,  setTagInputOpen]  = useState(false);

  const items       = nodeType === 'head' ? (node._items || node.expenseItems || []) : [];
  const directTasks = nodeType === 'head' ? (node.directTasks  || []) : [];
  const tasks       = nodeType === 'item' ? (node.tasks || []) : [];
  const hasChildren = items.length > 0 || directTasks.length > 0 || tasks.length > 0;

  const allocated = node._alloc ?? node.allocated ?? 0;
  const spent     = node._spent ?? node.spent     ?? 0;
  const nfa = node._nfa ?? node.nfaCount     ?? node.executionStatus?.nfaCount     ?? 0;
  const po  = node._po  ?? node.poCount      ?? node.executionStatus?.poCount      ?? 0;
  const inv = node._inv ?? node.invoiceCount ?? node.executionStatus?.invoiceCount ?? 0;

  const tagIds = localTags[node.id] ?? (node.tagIds || []);
  const tags   = tagIds.map(id => allTags.find(t => t.id === id)).filter(Boolean);

  const nameStyle = depth === 0
    ? { fontWeight: 700, fontSize: 13, color: '#1A1D23' }
    : depth === 1
    ? { fontWeight: 600, fontSize: 12.5, color: '#2D3340' }
    : { fontWeight: 400, fontSize: 12,   color: '#52596A' };

  const dot = nodeType === 'head'
    ? { size: 9, bg: 'transparent', border: '2px solid #6366F1' }
    : nodeType === 'item'
    ? { size: 7, bg: '#F59E0B', border: 'none' }
    : { size: 6, bg: '#3B82F6', border: 'none' };

  const util    = pct(spent, allocated);
  const overrun = spent > allocated;
  const barClr  = overrun ? '#EF4444' : util > 85 ? '#F59E0B' : '#10B981';

  const entityType = nodeType === 'head' ? 'expenseHead' : nodeType === 'item' ? 'expenseItem' : 'task';

  const itemNfa = (item) => (item.tasks||[]).reduce((s,t) => s+(t.nfaCount||t.executionStatus?.nfaCount||0), 0) + (item.nfaCount||item.executionStatus?.nfaCount||0);
  const itemPo  = (item) => (item.tasks||[]).reduce((s,t) => s+(t.poCount||t.executionStatus?.poCount||0),   0) + (item.poCount||item.executionStatus?.poCount||0);
  const itemInv = (item) => (item.tasks||[]).reduce((s,t) => s+(t.invoiceCount||t.executionStatus?.invoiceCount||0),0) + (item.invoiceCount||item.executionStatus?.invoiceCount||0);

  // Effective budget type: union of head + all items + all tasks
  const effectiveBudgetType = (() => {
    if (nodeType !== 'head') return node.budgetType || null;
    const types = new Set();
    if (node.budgetType) types.add(node.budgetType);
    items.forEach(item => {
      if (item.budgetType) types.add(item.budgetType);
      (item.tasks || []).forEach(t => { if (t.budgetType) types.add(t.budgetType); });
    });
    directTasks.forEach(t => { if (t.budgetType) types.add(t.budgetType); });
    if (types.size === 0) return null;
    if (types.has('Both') || (types.has('Capex') && types.has('Opex'))) return 'Both';
    return types.has('Capex') ? 'Capex' : types.has('Opex') ? 'Opex' : null;
  })();

  // Opex / Capex split — prefer head's stored amounts, fall back to children
  const typeSplit = (() => {
    if (nodeType !== 'head') return null;
    const storedOpex  = Number(node.opexAmount  ?? -1);
    const storedCapex = Number(node.capexAmount ?? -1);
    if (storedOpex >= 0 || storedCapex >= 0) {
      const op = Math.max(0, storedOpex);
      const cap = Math.max(0, storedCapex);
      return (op > 0 || cap > 0) ? { opex: op, capex: cap } : null;
    }
    let opex = 0, capex = 0;
    if (items.length === 0 && directTasks.length === 0) {
      if (node.budgetType === 'Opex')   opex  = node.allocated || 0;
      if (node.budgetType === 'Capex')  capex = node.allocated || 0;
    } else {
      items.forEach(item => {
        const alloc = item._alloc ?? item.allocated ?? 0;
        if (item.budgetType === 'Opex')  opex  += alloc;
        if (item.budgetType === 'Capex') capex += alloc;
      });
      directTasks.forEach(t => {
        const alloc = t.allocated || 0;
        if (t.budgetType === 'Opex')  opex  += alloc;
        if (t.budgetType === 'Capex') capex += alloc;
      });
    }
    return (opex > 0 || capex > 0) ? { opex, capex } : null;
  })();

  const rowBg = '#fff';

  return (
    <div>
      {/* ROW — CSS Grid with corrected column order */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: ROW_GRID,
          columnGap: 12,
          alignItems: 'center',
          minHeight: 40,
          background: rowBg,
          borderBottom: '1px solid #F2F4F8',
          boxSizing: 'border-box',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#F8F9FC'; setHovered(true); }}
        onMouseLeave={e => { e.currentTarget.style.background = rowBg; setHovered(false); }}
      >

        {/* ── COL 1: Name / Tags ─────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, overflow: 'hidden', padding: '7px 8px 7px 0' }}>
          {depth > 0 && <div style={{ width: depth * INDENT_PER_DEPTH, flexShrink: 0 }} />}
          <button onClick={() => setExpanded(e => !e)}
            style={{ width: 18, height: 18, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, borderRadius: 4, cursor: hasChildren ? 'pointer' : 'default', color: hasChildren ? '#8B92A0' : 'transparent' }}
            onMouseEnter={e => { if (hasChildren) e.currentTarget.style.color = '#6366F1'; }}
            onMouseLeave={e => { e.currentTarget.style.color = hasChildren ? '#8B92A0' : 'transparent'; }}
          >
            {hasChildren ? (expanded ? <Ico.ChevD /> : <Ico.ChevR />) : null}
          </button>

          <span style={{ width: dot.size, height: dot.size, borderRadius: '50%', flexShrink: 0, background: dot.bg, border: dot.border }} />

          <span title={node.name}
            style={{ ...nameStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, cursor: nodeType === 'head' ? 'pointer' : 'default', transition: 'color 0.1s' }}
            onClick={nodeType === 'head' ? () => onOpen(node.id) : undefined}
            onMouseEnter={e => { if (nodeType === 'head') e.currentTarget.style.color = '#6366F1'; }}
            onMouseLeave={e => { if (nodeType === 'head') e.currentTarget.style.color = nameStyle.color; }}
          >
            {node.name}
          </span>

          {nodeType === 'head' && effectiveBudgetType && (() => {
            const isBoth  = effectiveBudgetType === 'Both';
            const isCapex = effectiveBudgetType === 'Capex';
            const bg     = isBoth ? '#FEF3C7' : isCapex ? '#EDE9FE' : '#DBEAFE';
            const color  = isBoth ? '#92400E' : isCapex ? '#6D28D9' : '#1D4ED8';
            const border = isBoth ? '#FDE68A' : isCapex ? '#DDD6FE' : '#BFDBFE';
            return (
              <span style={{ padding: '1px 6px', borderRadius: 20, fontSize: 9, fontWeight: 700, flexShrink: 0, background: bg, color, border: `1px solid ${border}` }}>
                {effectiveBudgetType}
              </span>
            );
          })()}

          {(nodeType === 'item' || nodeType === 'task') && node.budgetType === 'Capex' && (
            <span style={{ padding: '1px 6px', borderRadius: 20, fontSize: 9, fontWeight: 700, flexShrink: 0, background: '#EDE9FE', color: '#6D28D9', border: '1px solid #DDD6FE' }}>
              Capex
            </span>
          )}

          {node._isOverBudget && (
            <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 800, flexShrink: 0, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
              Over Budget
            </span>
          )}

          {/* Always-visible tag chips */}
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'nowrap', flexShrink: 0 }}>
              {tags.map(tag => (
                <TagChip key={tag.id} tag={tag}
                  onRemove={canEdit ? () => onTagUpdate(node.id, nodeType, tagIds.filter(x => x !== tag.id)) : undefined}
                />
              ))}
            </div>
          )}

          {/* Hover-only: tag input + contextual add-child button */}
          {(hovered || tagInputOpen) && canEdit && (
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
              <TagInput
                entityType={entityType} entityId={node.id}
                currentTagIds={tagIds} allTags={allTags}
                onSaved={ids => onTagUpdate(node.id, nodeType, ids)}
                onTagCreated={onTagCreated}
                onOpenChange={setTagInputOpen}
              />
              {nodeType === 'head' && (
                <button onClick={e => { e.stopPropagation(); onQuickAdd({ headId: node.id, level: 'item' }); }}
                  title="Add Expense Item"
                  style={{ display:'inline-flex', alignItems:'center', gap:2, height:18, padding:'0 6px', borderRadius:4, border:'1px dashed #059669', background:'transparent', cursor:'pointer', fontSize:10, fontWeight:600, color:'#059669', flexShrink:0, whiteSpace:'nowrap', transition:'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#ECFDF5'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <Ico.Plus /><span>Item</span>
                </button>
              )}
              {nodeType === 'item' && (
                <button onClick={e => { e.stopPropagation(); onQuickAdd({ headId: node.expenseHeadId, level: 'task', itemId: node.id }); }}
                  title="Add Task"
                  style={{ display:'inline-flex', alignItems:'center', gap:2, height:18, padding:'0 6px', borderRadius:4, border:'1px dashed #D97706', background:'transparent', cursor:'pointer', fontSize:10, fontWeight:600, color:'#D97706', flexShrink:0, whiteSpace:'nowrap', transition:'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#FFFBEB'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <Ico.Plus /><span>Task</span>
                </button>
              )}
              {nodeType === 'task' && (
                <button onClick={e => { e.stopPropagation(); onQuickAdd({ headId: node.expenseHeadId, level: 'task', itemId: node.expenseItemId ?? null }); }}
                  title="Add another task"
                  style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:18, height:18, borderRadius:4, border:'1px dashed #8B5CF6', background:'transparent', cursor:'pointer', color:'#8B5CF6', flexShrink:0, transition:'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#F5F3FF'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <Ico.Plus />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── COL 2: Financials ──────────────────────────── */}
        <div style={{ padding: '7px 8px' }}>
          {nodeType === 'head' ? (() => {
            const envelope = getEnvelopeMetrics(node);
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#1A1D23', whiteSpace: 'nowrap' }}>{fmtSh(envelope.totalBudget)}</span>
                  <span style={{ fontSize: 10, color: '#8B92A0', whiteSpace: 'nowrap' }}>budget</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ flex: 1, height: 4, background: '#EBEDF2', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', width: `${Math.min(envelope.reservedPct, 100)}%`, background: envelope.isOverBudget ? '#EF4444' : getEnvelopeBarColor(envelope.status), borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 9, color: envelope.isOverBudget ? '#EF4444' : getEnvelopeBarColor(envelope.status), fontWeight: 700, whiteSpace: 'nowrap' }}>{envelope.displayPct}%</span>
                </div>
                {typeSplit && (
                  <div style={{ display: 'flex', gap: 5, marginTop: 4, alignItems: 'center' }}>
                    {typeSplit.opex > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: '#4338CA', whiteSpace: 'nowrap' }}>Op {fmtSh(typeSplit.opex)}</span>}
                    {typeSplit.opex > 0 && typeSplit.capex > 0 && <span style={{ fontSize: 9, color: '#CBD5E1' }}>·</span>}
                    {typeSplit.capex > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: '#6D28D9', whiteSpace: 'nowrap' }}>Cap {fmtSh(typeSplit.capex)}</span>}
                  </div>
                )}
              </div>
            );
          })() : (() => {
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: allocated > 0 ? 3 : 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#1A1D23', whiteSpace: 'nowrap' }}>{fmtSh(allocated)}</span>
                  {allocated > 0 && (
                    <span style={{ fontSize: 10, color: overrun ? '#EF4444' : '#8B92A0', whiteSpace: 'nowrap' }}>{fmtSh(spent)} spent</span>
                  )}
                </div>
                {allocated > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ flex: 1, height: 3, background: '#EBEDF2', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(util, 100)}%`, background: barClr, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 9, color: overrun ? '#EF4444' : '#8B92A0', fontWeight: 600, whiteSpace: 'nowrap' }}>{util}%</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── COL 3: Allocation Breakup ──────────────────── */}
        <div style={{ padding: '7px 8px', display: 'flex', alignItems: 'center' }}>
          {nodeType === 'head' && (() => {
            const m = getEnvelopeMetrics(node);
            return (
              <span style={{
                fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                background: m.isOverBudget ? '#FEF2F2' : '#F1F5F9',
                border: m.isOverBudget ? '1px solid #FECACA' : '1px solid transparent',
                padding: '3px 8px', borderRadius: 4, display: 'flex', gap: 4
              }}>
                <span style={{ color: '#6366F1' }} title="Budget">{fmtSh(m.totalBudget)}</span>
                <span style={{ color: '#CBD5E1' }}>|</span>
                <span style={{ color: m.isOverBudget ? '#EF4444' : getEnvelopeBarColor(m.status) }} title="Reserved">{fmtSh(m.reserved)}</span>
                <span style={{ color: '#CBD5E1' }}>|</span>
                {m.isOverBudget ? (
                  <span style={{ color: '#EF4444', fontWeight: 800 }} title="Unbudgeted Spend">
                    +{fmtSh(m.overAmount)} unbudgeted
                  </span>
                ) : (
                  <span style={{ color: m.available <= 0 ? '#F59E0B' : '#10B981' }} title="Available">
                    {fmtSh(Math.max(0, m.available))}
                  </span>
                )}
              </span>
            );
          })()}
        </div>

        {/* ── COL 4: Execution pipeline ──────────────────── */}
        <div style={{ padding: '7px 8px', display: 'flex', gap: 4, alignItems: 'center' }}>
          {[
            { label: 'NFA', count: nfa, color: node.nfaRequired === 'yes' ? '#EA580C' : '#8B5CF6', required: node.nfaRequired === 'yes' },
            { label: 'PO',  count: po,  color: '#3B82F6' },
            { label: 'Inv', count: inv, color: '#F59E0B' },
          ].map(s => {
            const active = s.count > 0 || s.required;
            return (
              <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, background: active ? s.color+'15' : '#F4F5F7', color: active ? s.color : '#BCC1CB', border: `1px solid ${active ? s.color+'30' : '#E4E7ED'}` }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? s.color : '#BCC1CB', flexShrink: 0 }} />
                {s.label} {s.count > 0 ? `(${s.count})` : '—'}
              </span>
            );
          })}
        </div>

        {/* ── COL 5: Workspace ───────────────────────────── */}
        <div style={{ padding: '7px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          {nodeType === 'head' && (
            <button onClick={() => onOpen(node.id)} title="Open Workspace"
              style={{ width: 26, height: 26, borderRadius: 7, background: '#6366F1', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
              <Ico.Grid />
            </button>
          )}
        </div>

        {/* ── COL 6: Actions (Edit + Delete) ─────────────── */}
        <div style={{ padding: '7px 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }} onClick={e => e.stopPropagation()}>
          {canEdit && (
            <>
              <button onClick={() => onEdit(node, nodeType)} title="Edit"
                style={{ width: 24, height: 24, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#9BA3B2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.background='#EEF2FF'; e.currentTarget.style.color='#6366F1'; }}
                onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='#9BA3B2'; }}
              ><Ico.Edit /></button>
              <button onClick={() => onDelete(node, nodeType)} title="Delete"
                style={{ width: 24, height: 24, borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#9BA3B2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.background='#FEE2E2'; e.currentTarget.style.color='#EF4444'; }}
                onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='#9BA3B2'; }}
              ><Ico.Del /></button>
            </>
          )}
        </div>
      </div>

      {/* ── Children ─────────────────────────────────────── */}
      {expanded && hasChildren && (
        <div>
          {items.map(item => (
            <TreeRow key={item.id}
              node={{ ...item, _nfa: itemNfa(item), _po: itemPo(item), _inv: itemInv(item),
                _isOverBudget: (item._alloc ?? item.allocated ?? 0) > 0 && (item._spent ?? 0) > (item._alloc ?? item.allocated ?? 0) }}
              depth={1} nodeType="item"
              allTags={allTags} localTags={localTags} canEdit={canEdit}
              onTagUpdate={onTagUpdate} onTagCreated={onTagCreated}
              onEdit={onEdit} onDelete={onDelete} onOpen={onOpen} onQuickAdd={onQuickAdd}
            />
          ))}
          {directTasks.map(task => (
            <TreeRow key={task.id}
              node={{ ...task,
                _isOverBudget: (task.allocated || 0) > 0 && (task.spent || 0) > (task.allocated || 0) }}
              depth={1} nodeType="task"
              allTags={allTags} localTags={localTags} canEdit={canEdit}
              onTagUpdate={onTagUpdate} onTagCreated={onTagCreated}
              onEdit={onEdit} onDelete={onDelete} onOpen={onOpen} onQuickAdd={onQuickAdd}
            />
          ))}
          {tasks.map(task => (
            <TreeRow key={task.id}
              node={{ ...task,
                _isOverBudget: (task.allocated || 0) > 0 && (task.spent || 0) > (task.allocated || 0) }}
              depth={2} nodeType="task"
              allTags={allTags} localTags={localTags} canEdit={canEdit}
              onTagUpdate={onTagUpdate} onTagCreated={onTagCreated}
              onEdit={onEdit} onDelete={onDelete} onOpen={onOpen} onQuickAdd={onQuickAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MODAL
───────────────────────────────────────────────────────────── */
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,18,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(2px)' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 14px', borderBottom: '1px solid #F2F4F8' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1A1D23' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8B92A0', padding: 4 }}><Ico.Close /></button>
        </div>
        <div style={{ padding: '16px 24px' }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 24px 18px', borderTop: '1px solid #F2F4F8' }}>{footer}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   GUIDED ADD DIALOG
───────────────────────────────────────────────────────────── */
function GuidedAddDialog({ open, onClose, activeBudgetId, expenseHeads, onSaved, preselect }) {
  const [level,        setLevel]        = useState('item');
  const [selectedHead, setSelectedHead] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [newHeadName,  setNewHeadName]  = useState('');
  const [itemName,     setItemName]     = useState('');
  const [taskName,     setTaskName]     = useState('');
  const [allocated,    setAllocated]    = useState('');
  const [opexAmount,   setOpexAmount]   = useState('');
  const [capexAmount,  setCapexAmount]  = useState('');
  const [description,  setDescription]  = useState('');
  const [fn,           setFn]           = useState('');
  const [budgetType,   setBudgetType]   = useState('');
  const [category,     setCategory]     = useState('');
  const [spendCat,     setSpendCat]     = useState('');
  const [investType,   setInvestType]   = useState('');
  const [nfaReq,       setNfaReq]       = useState('no');
  const [saving,             setSaving]             = useState(false);
  const [error,              setError]              = useState('');
  const [overBudgetWarning,  setOverBudgetWarning]  = useState(null);

  useEffect(() => {
    if (open && preselect) {
      if (preselect.level)  setLevel(preselect.level);
      if (preselect.headId) setSelectedHead(preselect.headId);
      if (preselect.itemId) setSelectedItem(preselect.itemId);
      else setSelectedItem('');
    }
  }, [open, preselect]);

  const reset = () => {
    setLevel('item'); setSelectedHead(''); setSelectedItem(''); setNewHeadName(''); setItemName(''); setTaskName('');
    setAllocated(''); setOpexAmount(''); setCapexAmount(''); setDescription(''); setFn(''); setBudgetType(''); setCategory('');
    setSpendCat(''); setInvestType(''); setNfaReq('no'); setError(''); setOverBudgetWarning(null);
  };
  const handleClose = () => { reset(); onClose(); };
  const deriveHeadType = (op, cap) => op > 0 && cap > 0 ? 'Both' : cap > 0 ? 'Capex' : op > 0 ? 'Opex' : '';
  const bodyBase = () => ({ allocated: parseFloat(allocated)||0, description, function: fn, budgetType, category, spendCategory: spendCat, investmentType: investType, nfaRequired: nfaReq, budgetId: activeBudgetId });
  const labelMap = { head: 'Expense Head', item: 'Expense Item', task: 'Task' };

  useEffect(() => { setOverBudgetWarning(null); }, [allocated, level, selectedHead, selectedItem]);

  const fld = (label, el) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#52596A', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      {el}
    </div>
  );
  const inpStyle = { width: '100%', padding: '7px 10px', border: '1.5px solid #E4E7ED', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const inp = (val, set, opts = {}) => (
    <input value={val} onChange={e => set(e.target.value)} {...opts} style={inpStyle}
      onFocus={e => e.currentTarget.style.borderColor='#6366F1'}
      onBlur={e => e.currentTarget.style.borderColor='#E4E7ED'} />
  );
  const sel = (val, set, options) => (
    <select value={val} onChange={e => set(e.target.value)} style={{ ...inpStyle, background: '#fff' }}>
      <option value="">None</option>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );

  const handleSubmit = async () => {
    setError('');
    if (level === 'head' && !newHeadName.trim())           { setError('Enter an Expense Head name.'); return; }
    if (level !== 'head' && !selectedHead && !newHeadName.trim()) { setError('Select or create an Expense Head.'); return; }
    if (level === 'item' && !itemName.trim())              { setError('Enter an Expense Item name.'); return; }
    if (level === 'task' && !taskName.trim())              { setError('Enter a Task name.'); return; }

    setSaving(true);
    try {
      let headId = selectedHead;
      if (!selectedHead && newHeadName.trim()) {
        const op  = parseFloat(opexAmount)  || 0;
        const cap = parseFloat(capexAmount) || 0;
        const headBody = {
          ...bodyBase(),
          name: newHeadName.trim(),
          allocated: op + cap,
          budgetType: deriveHeadType(op, cap),
          opexAmount: op,
          capexAmount: cap,
        };
        const r = await fetch('/api/expense-heads', { method:'POST', headers:hj(), body:JSON.stringify(headBody) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
        headId = d.id;
        if (level === 'head') { onSaved(); handleClose(); setSaving(false); return; }
      }

      if (level === 'item') {
        if (!overBudgetWarning) {
          const parentHead = expenseHeads.find(h => h.id === headId);
          if (parentHead && Number(allocated) > 0) {
            const siblings = parentHead.expenseItems || [];
            const totalOthers = siblings.reduce((s, i) => s + (i.allocated || 0), 0);
            const overAmount = (totalOthers + Number(allocated)) - (parentHead.allocated || 0);
            if (overAmount > 0) {
              setOverBudgetWarning({ overAmount, message: `This allocation exceeds the head's budget by ₹${overAmount.toLocaleString('en-IN')}. This will be considered Over Budget.` });
              setSaving(false);
              return;
            }
          }
        }
        setOverBudgetWarning(null);
        const r = await fetch('/api/expense-items', { method:'POST', headers:hj(), body:JSON.stringify({ ...bodyBase(), name:itemName.trim(), expenseHeadId:headId }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error||`Error ${r.status}`);
      } else if (level === 'task') {
        if (!overBudgetWarning && Number(allocated) > 0) {
          let overAmount = 0; let ctx = '';
          if (selectedItem) {
            const ph = expenseHeads.find(h => h.id === headId);
            const pi = ph?.expenseItems?.find(i => i.id === selectedItem);
            if (pi) {
              const othersAlloc = (pi.tasks || []).reduce((s, t) => s + (t.allocated || 0), 0);
              overAmount = (othersAlloc + Number(allocated)) - (pi.allocated || 0);
              ctx = "the item's";
            }
          } else {
            const ph = expenseHeads.find(h => h.id === headId);
            if (ph) {
              const dtAlloc   = (ph.directTasks  || []).reduce((s, t) => s + (t.allocated || 0), 0);
              const itemAlloc = (ph.expenseItems || []).reduce((s, i) => s + (i.allocated || 0), 0);
              overAmount = (dtAlloc + itemAlloc + Number(allocated)) - (ph.allocated || 0);
              ctx = "the head's";
            }
          }
          if (overAmount > 0) {
            setOverBudgetWarning({ overAmount, message: `This task allocation exceeds ${ctx} budget by ₹${overAmount.toLocaleString('en-IN')}. This will be considered Over Budget.` });
            setSaving(false);
            return;
          }
        }
        setOverBudgetWarning(null);
        const r = await fetch('/api/tasks', { method:'POST', headers:hj(), body:JSON.stringify({ ...bodyBase(), name:taskName.trim(), expenseHeadId:headId, expenseItemId:selectedItem || null }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error||`Error ${r.status}`);
      }
      onSaved(); handleClose();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Expense"
      footer={<>
        <button onClick={handleClose} style={{ padding:'7px 16px', borderRadius:7, border:'1.5px solid #E4E7ED', background:'#fff', cursor:'pointer', fontSize:13, color:'#52596A' }}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving} style={{ padding:'7px 18px', borderRadius:7, border:'none', background: overBudgetWarning ? '#D97706' : '#6366F1', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, opacity:saving?0.7:1 }}>
          {saving ? 'Creating…' : overBudgetWarning ? 'Confirm Over Budget' : `Create ${labelMap[level]}`}
        </button>
      </>}>

      {error && <div style={{ padding:'8px 12px', background:'#FEE2E2', borderRadius:7, fontSize:12, color:'#991B1B', marginBottom:14 }}>{error}</div>}
      {overBudgetWarning && (
        <div style={{ padding:'8px 12px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:7, fontSize:12, color:'#92400E', marginBottom:14, display:'flex', alignItems:'flex-start', gap:8 }}>
          <span style={{ fontSize:14, flexShrink:0 }}>⚠️</span>
          <span>{overBudgetWarning.message} Click <strong>Confirm Over Budget</strong> to proceed.</span>
        </div>
      )}

      <div style={{ display:'flex', border:'1.5px solid #E4E7ED', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
        {[['head','Head'],['item','Item'],['task','Task']].map(([l,lbl]) => (
          <button key={l} onClick={() => setLevel(l)} style={{ flex:1, padding:'8px', fontSize:12, fontWeight:700, border:'none', cursor:'pointer', background:level===l?'#6366F1':'#fff', color:level===l?'#fff':'#8B92A0', transition:'all 0.15s' }}>{lbl}</button>
        ))}
      </div>

      <hr style={{ border:'none', borderTop:'1px solid #F2F4F8', margin:'0 0 14px' }} />

      {level !== 'head' && fld('Expense Head *',
        <div>
          <select value={selectedHead} onChange={e => { setSelectedHead(e.target.value); setSelectedItem(''); setNewHeadName(''); }}
            style={{ ...inpStyle, background:'#fff', marginBottom:8 }}>
            <option value="">— Select existing —</option>
            {expenseHeads.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:'#9BA3B2', whiteSpace:'nowrap', fontWeight:600 }}>or new:</span>
            <input value={newHeadName} onChange={e => { setNewHeadName(e.target.value); if (e.target.value) setSelectedHead(''); }}
              placeholder="Type head name…" style={{ flex:1, padding:'6px 9px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:12, outline:'none' }} />
          </div>
        </div>
      )}

      {level === 'task' && selectedHead && (() => {
        const headItems = (expenseHeads.find(h => h.id === selectedHead)?.expenseItems || []);
        if (!headItems.length) return null;
        return fld('Under Expense Item',
          <select value={selectedItem} onChange={e => setSelectedItem(e.target.value)}
            style={{ ...inpStyle, background:'#fff' }}>
            <option value="">— Direct task under head —</option>
            {headItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        );
      })()}
      {level === 'head' && fld('Head Name *', inp(newHeadName, setNewHeadName, { autoFocus:true, placeholder:'e.g. IT Infrastructure' }))}
      {level === 'item' && fld('Item Name *', inp(itemName,    setItemName,    { autoFocus:true, placeholder:'e.g. Software Licenses'  }))}
      {level === 'task' && fld('Task Name *', inp(taskName,    setTaskName,    { autoFocus:true, placeholder:'e.g. License Purchase'    }))}

      <hr style={{ border:'none', borderTop:'1px solid #F2F4F8', margin:'4px 0 14px' }} />

      {level === 'head' ? (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:0 }}>
            <div>{fld('Opex Amount (₹)', <input type="number" min={0} step={0.01} value={opexAmount} onChange={e => setOpexAmount(e.target.value)} placeholder="0" style={inpStyle} />)}</div>
            <div>{fld('Capex Amount (₹)', <input type="number" min={0} step={0.01} value={capexAmount} onChange={e => setCapexAmount(e.target.value)} placeholder="0" style={inpStyle} />)}</div>
          </div>
          {((parseFloat(opexAmount)||0)+(parseFloat(capexAmount)||0)) > 0 && (
            <div style={{ fontSize:11, color:'#52596A', marginBottom:12, padding:'5px 10px', background:'#F8F9FC', borderRadius:6, border:'1px solid #E4E7ED' }}>
              Total ₹{((parseFloat(opexAmount)||0)+(parseFloat(capexAmount)||0)).toLocaleString('en-IN')} · Budget Type: <strong>{deriveHeadType(parseFloat(opexAmount)||0, parseFloat(capexAmount)||0)}</strong>
            </div>
          )}
        </>
      ) : (
        fld('Allocated (₹)', <input type="number" min={0} step={0.01} value={allocated} onChange={e => setAllocated(e.target.value)} style={inpStyle} />)
      )}
      {fld('Description',   <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ ...inpStyle, resize:'vertical', fontFamily:'inherit' }} />)}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div>{fld('Function',        sel(fn,        setFn,        FN_OPTIONS))}</div>
        {level !== 'head' && <div>{fld('Budget Type', sel(budgetType, setBudgetType, BUDGET_TYPES))}</div>}
        <div>{fld('Category',        sel(category,  setCategory,  CAT_OPTIONS))}</div>
        <div>{fld('Spend Category',  sel(spendCat,  setSpendCat,  SPEND_CAT))}</div>
        <div>{fld('Investment Type', sel(investType, setInvestType,INV_TYPE))}</div>
        <div>{fld('NFA Required',    sel(nfaReq,    setNfaReq,    ['yes','no']))}</div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────── */
export default function Budgets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit  = ['Admin','Finance'].includes(user?.role);

  const [budgets,      setBudgets]      = useState([]);
  const [activeBudget, setActiveBudget] = useState(null);
  const [heads,        setHeads]        = useState([]);
  const [allTags,      setAllTags]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [headLoading,  setHeadLoading]  = useState(false);
  const [search,       setSearch]       = useState('');
  const [localTags,    setLocalTags]    = useState({});
  const [addOpen,      setAddOpen]      = useState(false);
  const [addPreselect, setAddPreselect] = useState(null);
  const [fyOpen,       setFyOpen]       = useState(false);
  const [newFy,        setNewFy]        = useState('');
  const [editTarget,   setEditTarget]   = useState(null);
  const [editForm,     setEditForm]     = useState({ name:'', allocated:'', opexAmount:'', capexAmount:'', description:'', function:'', budgetType:'', category:'', spendCategory:'', investmentType:'', nfaRequired:'no' });
  const [editError,            setEditError]            = useState('');
  const [editOverBudgetWarning,setEditOverBudgetWarning] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [delError,     setDelError]     = useState('');

  const loadBudgets = async (preserve = false) => {
    setLoading(true);
    try {
      const r = await fetch('/api/budgets', { headers: authH() });
      if (r.ok) {
        const data   = await r.json();
        const unique = data.filter((b,i,a) => a.findIndex(x=>x.id===b.id)===i);
        setBudgets(unique);
        if (!preserve && unique.length) setActiveBudget(p => p || unique[0]);
      }
    } catch {}
    setLoading(false);
  };

  const loadHeads = useCallback(async budgetId => {
    if (!budgetId) return;
    setHeadLoading(true);
    try {
      const r = await fetch(`/api/expense-heads?budgetId=${budgetId}`, { headers: authH() });
      if (r.ok) { setHeads(await r.json()); setLocalTags({}); }
    } catch {}
    setHeadLoading(false);
  }, []);

  const loadTags = async () => {
    try { const r = await fetch('/api/tags', { headers: authH() }); if (r.ok) setAllTags(await r.json()); } catch {}
  };

  useEffect(() => { loadBudgets(); loadTags(); }, []);
  useEffect(() => { if (activeBudget) loadHeads(activeBudget.id); }, [activeBudget?.id, loadHeads]);

  const handleTagUpdate  = useCallback((id, _t, ids) => setLocalTags(p => ({ ...p, [id]: ids })), []);
  const handleTagCreated = useCallback(tag => setAllTags(p => [...p, tag]), []);
  const handleQuickAdd   = useCallback((preselect) => { setAddPreselect(preselect); setAddOpen(true); }, []);

  const handleEdit = (node, nodeType) => {
    setEditTarget({ node, nodeType });
    const finalOpex  = node.opexAmount  != null ? node.opexAmount
      : node.budgetType === 'Opex'  ? (node.allocated || 0) : 0;
    const finalCapex = node.capexAmount != null ? node.capexAmount
      : node.budgetType === 'Capex' ? (node.allocated || 0) : 0;
    setEditForm({
      name: node.name,
      allocated: node.allocated || 0,
      opexAmount:  finalOpex,
      capexAmount: finalCapex,
      description: node.description || '',
      function: node.function || '',
      budgetType: node.budgetType || '',
      category: node.category || '',
      spendCategory: node.spendCategory || '',
      investmentType: node.investmentType || '',
      nfaRequired: node.nfaRequired || 'no'
    });
    setEditError('');
    setEditOverBudgetWarning(null);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setEditError('');

    if (editTarget.nodeType === 'item' && !editOverBudgetWarning) {
      const parentHead = heads.find(h => h.id === editTarget.node.expenseHeadId);
      if (parentHead) {
        const siblings = parentHead.expenseItems || [];
        const othersAlloc = siblings
          .filter(i => i.id !== editTarget.node.id)
          .reduce((s, i) => s + (i.allocated || 0), 0);
        const overAmount = (othersAlloc + Number(editForm.allocated)) - (parentHead.allocated || 0);
        if (overAmount > 0) {
          setEditOverBudgetWarning({ overAmount, message: `This allocation exceeds the head's budget by ₹${overAmount.toLocaleString('en-IN')}. This will be considered Over Budget.` });
          return;
        }
      }
    } else if (editTarget.nodeType === 'task' && !editOverBudgetWarning) {
      if (editTarget.node.expenseItemId) {
        let parentItem = null;
        for (const head of heads) {
          const found = (head.expenseItems || []).find(i => i.id === editTarget.node.expenseItemId);
          if (found) { parentItem = found; break; }
        }
        if (parentItem) {
          const othersAlloc = (parentItem.tasks || [])
            .filter(t => t.id !== editTarget.node.id)
            .reduce((s, t) => s + (t.allocated || 0), 0);
          const overAmount = (othersAlloc + Number(editForm.allocated)) - (parentItem.allocated || 0);
          if (overAmount > 0) {
            setEditOverBudgetWarning({ overAmount, message: `This task allocation exceeds the item's budget by ₹${overAmount.toLocaleString('en-IN')}. This will be considered Over Budget.` });
            return;
          }
        }
      } else {
        const parentHead = heads.find(h => h.id === editTarget.node.expenseHeadId);
        if (parentHead) {
          const dtAlloc   = (parentHead.directTasks  || []).filter(t => t.id !== editTarget.node.id).reduce((s, t) => s + (t.allocated || 0), 0);
          const itemAlloc = (parentHead.expenseItems || []).reduce((s, i) => s + (i.allocated || 0), 0);
          const overAmount = (dtAlloc + itemAlloc + Number(editForm.allocated)) - (parentHead.allocated || 0);
          if (overAmount > 0) {
            setEditOverBudgetWarning({ overAmount, message: `This task allocation exceeds the head's budget by ₹${overAmount.toLocaleString('en-IN')}. This will be considered Over Budget.` });
            return;
          }
        }
      }
    }
    setEditOverBudgetWarning(null);

    const map = { head:'expense-heads', item:'expense-items', task:'tasks' };
    try {
      const base = {
        name: editForm.name,
        description: editForm.description,
        function: editForm.function,
        category: editForm.category,
        spendCategory: editForm.spendCategory,
        investmentType: editForm.investmentType,
        nfaRequired: editForm.nfaRequired,
      };
      let body;
      if (editTarget.nodeType === 'head') {
        const op  = parseFloat(editForm.opexAmount)  || 0;
        const cap = parseFloat(editForm.capexAmount) || 0;
        body = { ...base, opexAmount: op, capexAmount: cap, allocated: op + cap,
          budgetType: op > 0 && cap > 0 ? 'Both' : cap > 0 ? 'Capex' : op > 0 ? 'Opex' : '' };
      } else {
        body = { ...base, allocated: parseFloat(editForm.allocated) || 0, budgetType: editForm.budgetType };
      }
      const r = await fetch(`/api/${map[editTarget.nodeType]}/${editTarget.node.id}`, {
        method: 'PATCH',
        headers: hj(),
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setEditTarget(null);
        loadHeads(activeBudget.id);
      } else {
        const d = await r.json();
        setEditError(d.error || 'Update failed');
      }
    } catch (err) {
      setEditError('Network error');
    }
  };

  const handleDelete        = (node, nodeType) => { setDeleteTarget({ node, nodeType }); setDelError(''); };
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const map = { head:'expense-heads', item:'expense-items', task:'tasks' };
    try {
      const r = await fetch(`/api/${map[deleteTarget.nodeType]}/${deleteTarget.node.id}`, { method:'DELETE', headers:authH() });
      const d = await r.json();
      if (!r.ok) { setDelError(d.error||'Delete failed'); return; }
      setDeleteTarget(null); loadHeads(activeBudget.id);
    } catch {}
  };

  const handleAddFY = async () => {
    if (!newFy.trim()) return;
    try {
      const r = await fetch('/api/budgets', { method:'POST', headers:hj(), body:JSON.stringify({ fy:newFy.trim() }) });
      if (r.ok) { setFyOpen(false); setNewFy(''); loadBudgets(true); }
    } catch {}
  };

  const enriched       = heads.map(aggregateNode);
  const filtered       = enriched.filter(h => !search || h.name.toLowerCase().includes(search.toLowerCase()));
  const totalAllocated = filtered.reduce((s,h) => s+(h._alloc||0), 0);
  const totalSpent     = filtered.reduce((s,h) => s+(h._spent||0), 0);
  const remaining      = totalAllocated - totalSpent;

  const btnBase    = { borderRadius:7, border:'none', cursor:'pointer', fontSize:13, fontWeight:700, padding:'7px 18px' };
  const btnGhost   = { ...btnBase, background:'#fff', border:'1.5px solid #E4E7ED', color:'#52596A', fontWeight:400 };
  const btnPrimary = { ...btnBase, background:'#6366F1', color:'#fff' };
  const btnDanger  = { ...btnBase, background:'#EF4444', color:'#fff' };

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:64 }}>
      <div style={{ width:28, height:28, border:'3px solid #E4E7ED', borderTopColor:'#6366F1', borderRadius:'50%', animation:'bspin 0.7s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ width:'100%', padding:'24px 28px', boxSizing:'border-box' }}>

      {/* PAGE HEADER */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:22 }}>
        <div>
          <h1 style={{ margin:0, fontSize:20, fontWeight:800, color:'#1A1D23', letterSpacing:'-0.3px' }}>Budget Planner</h1>
          <p style={{ margin:'3px 0 0', fontSize:12, color:'#8B92A0' }}>Expense heads, items and tasks with execution tracking</p>
        </div>
        {canEdit && (
          <button onClick={() => setAddOpen(true)} disabled={!activeBudget}
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:8, border:'none', background:'#6366F1', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', boxShadow:'0 2px 8px rgba(99,102,241,0.3)' }}>
            <Ico.Plus /> Add Expense
          </button>
        )}
      </div>

      {/* FY TABS */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:20 }}>
        {budgets.map(b => (
          <button key={b.id} onClick={() => setActiveBudget(b)} style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer', border:`1.5px solid ${activeBudget?.id===b.id?'#6366F1':'transparent'}`, background:activeBudget?.id===b.id?'#6366F1':'#F2F4F8', color:activeBudget?.id===b.id?'#fff':'#52596A', transition:'all 0.12s' }}>
            {b.fy}
          </button>
        ))}
        {canEdit && (
          <button onClick={() => setFyOpen(true)} style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', border:'1.5px dashed #C4C9D4', background:'transparent', color:'#9BA3B2' }}>
            + Add FY
          </button>
        )}
      </div>

      {/* SUMMARY CARDS */}
      <div style={{ display:'flex', gap:14, marginBottom:20, flexWrap:'wrap' }}>
        {[
          { label:'Expense Heads',   value:filtered.length,      color:'#6366F1', bg:'#EEF2FF' },
          { label:'Total Allocated', value:fmt(totalAllocated),  color:'#8B5CF6', bg:'#F5F3FF' },
          { label:'Total Spent',     value:fmt(totalSpent),      color:'#F59E0B', bg:'#FFFBEB' },
          { label:'Remaining',       value:fmt(remaining), color:remaining<0?'#EF4444':'#10B981', bg:remaining<0?'#FEF2F2':'#F0FDF4' },
        ].map(s => (
          <div key={s.label} style={{ flex:'1 1 150px', background:s.bg, border:`1px solid ${s.color}20`, borderRadius:10, padding:'12px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:s.color+'AA', marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* SEARCH */}
      <div style={{ marginBottom:14 }}>
        <div style={{ position:'relative', display:'inline-flex', alignItems:'center' }}>
          <span style={{ position:'absolute', left:10, color:'#9BA3B2', pointerEvents:'none', display:'flex' }}><Ico.Search /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expense heads…"
            style={{ padding:'7px 12px 7px 32px', border:'1.5px solid #E4E7ED', borderRadius:8, fontSize:13, width:260, outline:'none' }}
            onFocus={e => e.currentTarget.style.borderColor='#6366F1'}
            onBlur={e => e.currentTarget.style.borderColor='#E4E7ED'}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position:'absolute', right:10, background:'none', border:'none', cursor:'pointer', color:'#9BA3B2', padding:0, display:'flex' }}>
              <Ico.Close />
            </button>
          )}
        </div>
      </div>

      {/* TABLE WRAPPER */}
      <div style={{ border:'1px solid #EBEDF2', borderRadius:10, overflow:'hidden' }}>

        {/* COLUMN HEADERS */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: ROW_GRID,
          columnGap: 12,
          alignItems: 'center',
          background: '#F8F9FC',
          borderBottom: '1px solid #EBEDF2',
          minHeight: 36,
        }}>
          {[
            { label: 'Name / Tags' },
            { label: 'Financials' },
            { label: 'Allocation' },
            { label: 'Execution' },
            { label: 'Workspace', center: true },
            { label: 'Actions',   right: true },
          ].map((col, i) => (
            <div key={i} style={{ padding: '0 8px', textAlign: col.center ? 'center' : col.right ? 'right' : 'left' }}>
              <span style={{ fontSize:10, fontWeight:600, color:'#8B92A0', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                {col.label}
              </span>
            </div>
          ))}
        </div>

        {/* LOADING BAR */}
        {headLoading && (
          <div style={{ height:2, background:'linear-gradient(to right,#6366F1,#8B5CF6,#EC4899)', animation:'bpulse 1.2s ease-in-out infinite' }} />
        )}

        {/* EMPTY STATE */}
        {!headLoading && filtered.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'56px 24px', gap:12, textAlign:'center', background:'#fff' }}>
            <div style={{ fontSize:40, opacity:0.5 }}>📋</div>
            <p style={{ margin:0, fontWeight:700, fontSize:14, color:'#52596A' }}>
              {!activeBudget ? 'Select a financial year to begin' : heads.length===0 ? 'No expense heads yet' : 'No results for your search'}
            </p>
            {heads.length===0 && canEdit && (
              <button onClick={() => setAddOpen(true)}
                style={{ padding:'8px 18px', borderRadius:8, border:'1.5px solid #6366F1', background:'transparent', color:'#6366F1', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                + Add First Expense Head
              </button>
            )}
          </div>
        )}

        {/* DATA ROWS */}
        <div style={{ background:'#fff' }}>
          {!headLoading && filtered.map((head, i) => (
            <div key={head.id} style={{ borderTop: i>0 ? '2px solid #F0F2F8' : 'none' }}>
              <TreeRow
                node={head} depth={0} nodeType="head"
                allTags={allTags} localTags={localTags} canEdit={canEdit}
                onTagUpdate={handleTagUpdate} onTagCreated={handleTagCreated}
                onEdit={handleEdit} onDelete={handleDelete}
                onOpen={id => navigate(`/expense-head/${id}`)}
                onQuickAdd={handleQuickAdd}
              />
            </div>
          ))}
        </div>
      </div>

      {/* MODALS */}
      <GuidedAddDialog open={addOpen} onClose={() => { setAddOpen(false); setAddPreselect(null); }}
        activeBudgetId={activeBudget?.id} expenseHeads={heads}
        preselect={addPreselect}
        onSaved={() => loadHeads(activeBudget?.id)} />

      <Modal open={!!editTarget} onClose={() => { setEditTarget(null); setEditOverBudgetWarning(null); }} title={`Edit ${nodeTypeLabel(editTarget?.nodeType)}`}
        footer={<>
          <button style={btnGhost} onClick={() => { setEditTarget(null); setEditOverBudgetWarning(null); }}>Cancel</button>
          <button style={editOverBudgetWarning ? { ...btnBase, background:'#D97706', color:'#fff' } : btnPrimary} onClick={handleEditSave} disabled={!editForm.name}>
            {editOverBudgetWarning ? 'Confirm Over Budget' : 'Save Changes'}
          </button>
        </>}>
        {editError && <div style={{ padding:'8px 12px', background:'#FEE2E2', borderRadius:6, fontSize:12, color:'#991B1B', marginBottom:14, border:'1px solid #FECACA' }}>{editError}</div>}
        {editOverBudgetWarning && (
          <div style={{ padding:'8px 12px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:6, fontSize:12, color:'#92400E', marginBottom:14, display:'flex', alignItems:'flex-start', gap:8 }}>
            <span style={{ fontSize:14, flexShrink:0 }}>⚠️</span>
            <span>{editOverBudgetWarning.message} Click <strong>Confirm Over Budget</strong> to save.</span>
          </div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div style={{ gridColumn: editTarget?.nodeType === 'head' ? '1 / -1' : undefined }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>Name *</label>
            <input value={editForm.name} autoFocus onChange={e => setEditForm(f => ({ ...f, name:e.target.value }))}
              style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>
          {editTarget?.nodeType === 'head' ? (
            <>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>Opex Amount (₹)</label>
                <input type="number" min={0} value={editForm.opexAmount} onChange={e => setEditForm(f => ({ ...f, opexAmount:e.target.value }))}
                  style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>Capex Amount (₹)</label>
                <input type="number" min={0} value={editForm.capexAmount} onChange={e => setEditForm(f => ({ ...f, capexAmount:e.target.value }))}
                  style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              {((parseFloat(editForm.opexAmount)||0)+(parseFloat(editForm.capexAmount)||0)) > 0 && (
                <div style={{ gridColumn:'1/-1', fontSize:11, color:'#52596A', padding:'5px 10px', background:'#F8F9FC', borderRadius:6, border:'1px solid #E4E7ED' }}>
                  Total ₹{((parseFloat(editForm.opexAmount)||0)+(parseFloat(editForm.capexAmount)||0)).toLocaleString('en-IN')} · Budget Type: <strong>{(parseFloat(editForm.opexAmount)||0)>0&&(parseFloat(editForm.capexAmount)||0)>0?'Both':(parseFloat(editForm.capexAmount)||0)>0?'Capex':'Opex'}</strong>
                </div>
              )}
            </>
          ) : (
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>Allocated (₹)</label>
              <input type="number" min={0} value={editForm.allocated} onChange={e => { setEditForm(f => ({ ...f, allocated:e.target.value })); setEditOverBudgetWarning(null); }}
                style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
            </div>
          )}
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>Description</label>
          <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description:e.target.value }))}
            style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit', resize:'vertical' }} rows={2} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>Function</label>
            <select value={editForm.function} onChange={e => setEditForm(f => ({ ...f, function:e.target.value }))}
              style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }}>
              <option value="">None</option>
              {FN_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>Category</label>
            <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category:e.target.value }))}
              style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }}>
              <option value="">None</option>
              {CAT_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          {editTarget?.nodeType !== 'head' && (
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>Budget Type</label>
              <select value={editForm.budgetType} onChange={e => setEditForm(f => ({ ...f, budgetType:e.target.value }))}
                style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }}>
                <option value="">None</option>
                {BUDGET_TYPES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>Spend Category</label>
            <select value={editForm.spendCategory} onChange={e => setEditForm(f => ({ ...f, spendCategory:e.target.value }))}
              style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }}>
              <option value="">None</option>
              {SPEND_CAT.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>Investment Type</label>
            <select value={editForm.investmentType} onChange={e => setEditForm(f => ({ ...f, investmentType:e.target.value }))}
              style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }}>
              <option value="">None</option>
              {INV_TYPE.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>NFA Required</label>
            <select value={editForm.nfaRequired} onChange={e => setEditForm(f => ({ ...f, nfaRequired:e.target.value }))}
              style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={`Delete ${nodeTypeLabel(deleteTarget?.nodeType)}?`}
        footer={<><button style={btnGhost} onClick={() => setDeleteTarget(null)}>Cancel</button><button style={btnDanger} onClick={handleDeleteConfirm}>Delete</button></>}>
        <p style={{ margin:'0 0 10px', fontSize:13, color:'#2D3340' }}>Delete <strong>{deleteTarget?.node?.name}</strong>? This cannot be undone.</p>
        {delError && <div style={{ padding:'7px 10px', background:'#FEE2E2', borderRadius:6, fontSize:12, color:'#991B1B' }}>{delError}</div>}
      </Modal>

      <Modal open={fyOpen} onClose={() => setFyOpen(false)} title="Add Financial Year"
        footer={<><button style={btnGhost} onClick={() => setFyOpen(false)}>Cancel</button><button style={btnPrimary} onClick={handleAddFY} disabled={!newFy.trim()}>Create</button></>}>
        <div>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#52596A', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>FY Label</label>
          <input value={newFy} autoFocus onChange={e => setNewFy(e.target.value)} placeholder="e.g. FY 27-28"
            onKeyDown={e => e.key==='Enter' && handleAddFY()}
            style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #E4E7ED', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
        </div>
      </Modal>

      <style>{`
        @keyframes bspin  { to { transform: rotate(360deg); } }
        @keyframes bpulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}