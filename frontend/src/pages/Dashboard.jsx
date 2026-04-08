/* pages/Dashboard.jsx — FY 2026-27
   shared.js dependency removed — all tokens inlined.
*/
import { useEffect, useState, useRef } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

const FY  = "FY 2026-27";
const tkn = () => localStorage.getItem("token") || "";
const hdr = () => ({ Authorization: `Bearer ${tkn()}` });

/* ── Inlined tokens (replaces shared.js) ─────────────────── */
const T = {
  bg:"#F7F8FC", card:"#FFFFFF", border:"#E8ECF4",
  text:"#1A2035", sub:"#4A5578", muted:"#8C96B0",
  indigo:"#4F6EF7", violet:"#8B5CF6", teal:"#0EA5A0",
  rose:"#F43F6E", amber:"#F59E0B", emerald:"#10B981", orange:"#F97316",
};
const fmtK = v => {
  const n = Number(v || 0);
  if (n >= 10000000) return `₹${(n/10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n/100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n/1000).toFixed(0)}k`;
  return `₹${n}`;
};
const timeAgo = date => {
  if (!date) return "—";
  const diff = Math.floor((new Date() - new Date(date)) / 1000);
  if (diff < 3600)   return `${Math.floor(diff/60)||1}m ago`;
  if (diff < 86400)  return `${Math.floor(diff/3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
  return new Date(date).toLocaleDateString("en-IN", { day:"numeric", month:"short" });
};
const IS = {
  border:`1px solid #E2E8F0`, borderRadius:8, padding:"8px 12px",
  fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:"none",
  width:"100%", boxSizing:"border-box", color:"#1A2035", background:"#fff",
};
const SLabel = ({ children, color = T.indigo }) => (
  <div style={{ fontSize:10, fontWeight:700, color:T.sub, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:14, display:"flex", alignItems:"center", gap:7, fontFamily:"'DM Sans',sans-serif" }}>
    <span style={{ width:3, height:12, background:color, borderRadius:2, display:"inline-block" }}/>
    {children}
  </div>
);
const TH = ({ children, right }) => (
  <th style={{ padding:"8px 16px", fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.09em", fontFamily:"'DM Sans',sans-serif", textAlign:right?"right":"left", borderBottom:`1px solid ${T.border}`, background:"#FAFBFF" }}>{children}</th>
);
const TD = ({ children, right, bold, color }) => (
  <td style={{ padding:"10px 16px", fontSize:12, fontFamily:"'DM Sans',sans-serif", textAlign:right?"right":"left", fontWeight:bold?700:400, color:color||T.sub, borderBottom:`1px solid ${T.border}` }}>{children}</td>
);

/* ── keyframes ───────────────────────────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("db-kf2")) {
  const s = document.createElement("style");
  s.id = "db-kf2";
  s.textContent = `
    @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    @keyframes fadein{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
    .dbin{animation:fadein 0.3s ease both}
    @keyframes livepulse{0%,100%{box-shadow:0 0 0 3px rgba(34,197,94,0.35)}50%{box-shadow:0 0 0 6px rgba(34,197,94,0.1)}}
    @keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}
  `;
  document.head.appendChild(s);
}
if (typeof document !== "undefined" && !document.getElementById("ai-strip-shimmer")) {
  const s = document.createElement("style");
  s.id = "ai-strip-shimmer";
  s.textContent = `@keyframes aiShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`;
  document.head.appendChild(s);
}
const PL = { background:"linear-gradient(90deg,#edf0f7 25%,#f5f7fb 50%,#edf0f7 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite", borderRadius:6 };
const Sk = ({ w="100%", h=16, r=6, style={} }) => <div style={{ width:w, height:h, borderRadius:r, ...PL, ...style }} />;

/* ── SKELETON ─────────────────────────────────────────────── */
function DashSkeleton() {
  return (
    <div style={{ padding:"24px 28px", maxWidth:1280, margin:"0 auto" }}>
      <div style={{ background:"#fff", borderRadius:12, padding:"14px 20px", marginBottom:14, border:"1px solid #E8ECF4", display:"flex", gap:16, alignItems:"center" }}>
        <Sk w={60} h={10}/><Sk w="70%" h={10}/><Sk w={80} h={10}/>
      </div>
      <div style={{ background:"#fff", borderRadius:14, padding:"16px 20px", marginBottom:14, border:"1px solid #E8ECF4" }}>
        <Sk w={160} h={12} style={{ marginBottom:10 }}/><Sk h={36} r={10}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:14 }}>
        {[...Array(5)].map((_,i) => (
          <div key={i} style={{ background:"#fff", borderRadius:14, padding:18, border:"1px solid #E8ECF4" }}>
            <Sk w={70} h={9} style={{ marginBottom:10 }}/><Sk w={100} h={26} style={{ marginBottom:6 }}/><Sk w={60} h={9}/>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1.6fr 1fr", gap:14 }}>
        <div style={{ background:"#fff", borderRadius:14, padding:20, border:"1px solid #E8ECF4" }}>
          <Sk w={140} h={10} style={{ marginBottom:14 }}/><Sk h={200}/>
        </div>
        <div style={{ background:"#fff", borderRadius:14, padding:20, border:"1px solid #E8ECF4" }}>
          <Sk w={110} h={10} style={{ marginBottom:14 }}/>
          {[...Array(5)].map((_,i) => <Sk key={i} h={14} style={{ marginBottom:10 }}/>)}
        </div>
      </div>
    </div>
  );
}

/* ── AI INSIGHT STRIP ─────────────────────────────────────── */
function AIInsightStrip({ stats, aiSummary }) {
  const { totalBudget=0, totalSpent=0, remaining=0, burnRate=0, pendingInvoicesCount=0, pendingNFA=0, overdueCount=0, overdueAmount=0 } = stats || {};
  const pct    = totalBudget > 0 ? ((totalSpent/totalBudget)*100).toFixed(1) : "0.0";
  const runway = burnRate > 0 ? Math.round(remaining/burnRate) : null;
  const risks  = (aiSummary||[]).filter(r => r.type==="critical"||r.type==="warning");
  const alerts = [
    overdueCount > 0 && `${overdueCount} overdue invoice${overdueCount>1?"s":""} totalling ${fmtK(overdueAmount)}`,
    pendingNFA > 0 && `${pendingNFA} project${pendingNFA>1?"s":""} pending NFA approval`,
    pendingInvoicesCount > 0 && `${pendingInvoicesCount} invoice${pendingInvoicesCount>1?"s":""} awaiting payment`,
    ...risks.map(r => `${r.label}: ${r.value}`),
  ].filter(Boolean);
  const uPct  = parseFloat(pct);
  const uCol  = uPct>85?"#EF4444":uPct>60?"#F59E0B":"#10B981";
  const rwCol = runway===null?"#94A3B8":runway<3?"#EF4444":runway<6?"#F59E0B":"#3B82F6";
  const rkCol = alerts.length===0?"#10B981":alerts.length<3?"#F59E0B":"#EF4444";
  const alertDot = a => a.toLowerCase().includes("overdue")?"#EF4444":"#F59E0B";
  const Metric = ({ dot, label, value, valueColor, sub }) => (
    <div style={{ display:"flex", flexDirection:"column", gap:0, minWidth:90 }}>
      <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:dot, flexShrink:0 }}/>
        <span style={{ fontSize:9, fontWeight:700, color:"#64748B", textTransform:"uppercase", letterSpacing:"0.09em", fontFamily:"'DM Sans',sans-serif" }}>{label}</span>
      </div>
      <div style={{ fontSize:26, fontWeight:900, color:valueColor, fontFamily:"'Plus Jakarta Sans',sans-serif", lineHeight:1.05, letterSpacing:"-0.02em" }}>{value}</div>
      <div style={{ fontSize:9, color:"#94A3B8", fontFamily:"'DM Sans',sans-serif", marginTop:2 }}>{sub}</div>
    </div>
  );
  return (
    <div style={{ background:"linear-gradient(135deg,#F0F6FF 0%,#F7FAFF 60%,#EEF4FF 100%)", border:"1px solid #DBEAFE", borderRadius:12, marginBottom:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(59,130,246,0.06)", position:"relative" }}>
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.65) 50%, transparent 80%)", backgroundSize:"200% 100%", animation:"aiShimmer 6s linear infinite", pointerEvents:"none", opacity:0.25 }}/>
      <div style={{ padding:"7px 16px 6px", borderBottom:"1px solid #EFF6FF", display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:11, color:"#3B82F6" }}>✦</span>
        <span style={{ fontSize:9, fontWeight:800, color:"#1D4ED8", fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:"0.06em", textTransform:"uppercase" }}>AI Budget Summary — {FY}</span>
      </div>
      <div style={{ display:"flex", alignItems:"stretch", minHeight:64 }}>
        <div style={{ display:"flex", gap:0, alignItems:"stretch", borderRight:"1px solid #DBEAFE", flexShrink:0 }}>
          <div style={{ padding:"10px 18px 10px 16px", borderRight:"1px solid #EFF6FF" }}>
            <Metric dot={uCol}  label="Utilisation"   value={`${pct}%`}                               valueColor={uCol}    sub={`of ${fmtK(totalBudget)} total`} />
          </div>
          <div style={{ padding:"10px 18px", borderRight:"1px solid #EFF6FF" }}>
            <Metric dot={rwCol} label="Runway"         value={runway!==null?`~${runway} mo`:"—"}       valueColor="#1E3A8A" sub={`${fmtK(remaining)} remaining`} />
          </div>
          <div style={{ padding:"10px 18px" }}>
            <Metric dot={rkCol} label="Risks Detected" value={String(alerts.length)}                   valueColor={rkCol}   sub="action required" />
          </div>
        </div>
        <div style={{ flex:1, padding:"10px 16px", display:"flex", flexDirection:"column", justifyContent:"center", gap:5 }}>
          {alerts.length===0
            ? <span style={{ fontSize:11, color:"#94A3B8", fontFamily:"'DM Sans',sans-serif" }}>No active risks detected.</span>
            : alerts.map((a,i) => (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:7 }}>
                <span style={{ width:6, height:6, borderRadius:"50%", background:alertDot(a), flexShrink:0, marginTop:4 }}/>
                <span style={{ fontSize:11, color:"#334155", fontFamily:"'DM Sans',sans-serif", lineHeight:1.45 }}>{a}</span>
              </div>
            ))
          }
        </div>
        {uPct > 80 && (
          <div style={{ flexShrink:0, padding:"10px 14px", display:"flex", alignItems:"center", borderLeft:"1px solid #FDE68A", background:"#FFFBEB" }}>
            <div style={{ background:"#FEF3C7", border:"1px solid #FDE68A", borderRadius:8, padding:"6px 11px", maxWidth:195, display:"flex", alignItems:"flex-start", gap:5 }}>
              <span style={{ fontSize:11, flexShrink:0, marginTop:1 }}>⚠</span>
              <span style={{ fontSize:10, color:"#92400E", fontFamily:"'DM Sans',sans-serif", lineHeight:1.4, fontWeight:600 }}>
                At current burn, FY budget may exceed allocation by ~{fmtK(Math.abs(totalSpent+(burnRate*(runway||0))-totalBudget))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── ASK AI ───────────────────────────────────────────────── */
const CHIPS = [
  "How much budget is left?",
  "Which vendors have highest payments?",
  "Projects pending NFA approval",
  "Overdue invoices summary",
  "What is the burn rate this quarter?",
];
function ruleAnswer(q, stats, aiSummary) {
  const ql = (q||"").toLowerCase();
  const { totalBudget=0, totalSpent=0, remaining=0, burnRate=0, overdueCount=0, overdueAmount=0, pendingNFA=0, pendingInvoicesCount=0, opexBudget=0, capexBudget=0 } = stats||{};
  if (ql.includes("budget")||ql.includes("left")||ql.includes("remaining")||ql.includes("how much"))
    return `Total remaining budget is ${fmtK(remaining)} out of ${fmtK(totalBudget)} approved (${totalBudget>0?((totalSpent/totalBudget)*100).toFixed(1):0}% utilised). Opex: ${fmtK(opexBudget)}, Capex: ${fmtK(capexBudget)}.`;
  if (ql.includes("burn")||ql.includes("rate")||ql.includes("quarter"))
    return `Average monthly burn rate is ${fmtK(burnRate)}. Total spent: ${fmtK(totalSpent)} — ${totalBudget>0?((totalSpent/totalBudget)*100).toFixed(1):0}% of approved budget.`;
  if (ql.includes("nfa")||ql.includes("approval")||ql.includes("pending"))
    return `${pendingNFA} project${pendingNFA!==1?"s are":" is"} pending NFA approval, and ${pendingInvoicesCount} invoice${pendingInvoicesCount!==1?"s are":" is"} awaiting payment.`;
  if (ql.includes("overdue")||ql.includes("invoice")||ql.includes("summary"))
    return overdueCount>0
      ? `There ${overdueCount===1?"is":"are"} ${overdueCount} overdue invoice${overdueCount!==1?"s":""} totalling ${fmtK(overdueAmount)}.`
      : `No overdue invoices. ${pendingInvoicesCount} invoice${pendingInvoicesCount!==1?"s are":" is"} pending payment.`;
  if (ql.includes("vendor")||ql.includes("payment")||ql.includes("highest"))
    return (aiSummary||[]).find(r=>(r.label||"").toLowerCase().includes("vendor"))?.value || "Visit the Vendors page for a full spend breakdown.";
  const critical = (aiSummary||[]).find(r=>r.type==="critical"||r.type==="warning");
  if (critical) return `${critical.label}: ${critical.value}. ${critical.action||""}`;
  return `Summary: ${fmtK(remaining)} remaining out of ${fmtK(totalBudget)} total. ${pendingNFA} NFA approvals pending, ${overdueCount} overdue invoices.`;
}
function AskAI({ stats, aiSummary, compact=false }) {
  const [msgs,  setMsgs]  = useState([]);
  const [input, setInput] = useState("");
  const [busy,  setBusy]  = useState(false);
  const chatRef = useRef(null);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [msgs]);
  const ask = async q => {
    const question = (typeof q==="string"?q:input).trim();
    if (!question||busy) return;
    setInput("");
    setMsgs(m=>[...m,{role:"user",text:question}]);
    setBusy(true);
    let answer = null;
    try {
      const res = await fetch("/api/ai/chat", { method:"POST", headers:{...hdr(),"Content-Type":"application/json"}, body:JSON.stringify({question,context:JSON.stringify({stats,insights:(aiSummary||[]).slice(0,4)})}) });
      if (res.ok) { const j=await res.json(); answer=j?.answer||j?.reply||null; }
    } catch {}
    setMsgs(m=>[...m,{role:"ai",text:answer||ruleAnswer(question,stats,aiSummary)}]);
    setBusy(false);
  };
  return (
    <div style={compact?{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}:{background:"#fff",border:"1px solid #E8ECF4",borderRadius:14,marginBottom:14,overflow:"hidden",boxShadow:"0 1px 6px rgba(79,110,247,0.07)"}}>
      <div style={{ padding:"12px 20px 10px", borderBottom:"1px solid #E8ECF4", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <span style={{ fontSize:16 }}>💬</span>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:"#1A2035", fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Ask AI</div>
          <div style={{ fontSize:10, color:"#8C96B0", fontFamily:"'DM Sans',sans-serif" }}>Ask about budgets, invoices, vendors or payments</div>
        </div>
      </div>
      <div style={{ padding:"10px 20px 0", display:"flex", gap:6, flexWrap:"wrap", flexShrink:0 }}>
        {CHIPS.map((c,i) => (
          <button key={i} onClick={()=>ask(c)} disabled={busy}
            style={{ padding:"4px 12px", borderRadius:20, border:"1px solid #E8ECF4", background:"#F7F8FC", fontSize:11, color:"#4A5578", cursor:busy?"default":"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
            {c}
          </button>
        ))}
      </div>
      <div ref={chatRef} style={{ height:compact?220:180, overflowY:"auto", padding:"12px 20px", display:"flex", flexDirection:"column", gap:8, flex:compact?1:"none", scrollBehavior:"smooth" }}>
        {msgs.length===0&&!busy&&<div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#C4CBDA",fontSize:11,fontFamily:"'DM Sans',sans-serif" }}>Click a chip above or type a question below</div>}
        {msgs.map((m,i) => (
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{ maxWidth:"80%", padding:"8px 14px", lineHeight:1.5, fontSize:12, fontFamily:"'DM Sans',sans-serif", borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px", background:m.role==="user"?"#4F6EF7":"#F7F8FC", color:m.role==="user"?"#fff":"#1A2035", border:m.role==="ai"?"1px solid #E8ECF4":"none" }}>{m.text}</div>
          </div>
        ))}
        {busy&&<div style={{ display:"flex",gap:4,alignItems:"center",color:"#8C96B0",fontSize:11,fontFamily:"'DM Sans',sans-serif",padding:"4px 0" }}>{[0,0.2,0.4].map((d,i)=><span key={i} style={{ width:6,height:6,borderRadius:"50%",background:"#C7D2FE",display:"inline-block",animation:`bounce 1.2s ${d}s infinite` }}/>)}&nbsp;Thinking…</div>}
      </div>
      <div style={{ padding:"10px 20px 14px", borderTop:"1px solid #E8ECF4", display:"flex", gap:8, flexShrink:0 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask();}}} placeholder="Ask about budgets, invoices, vendors…" style={{...IS,flex:1,fontSize:12}} disabled={busy}/>
        <button onClick={()=>ask()} disabled={!input.trim()||busy} style={{ padding:"8px 20px",borderRadius:10,border:"none",cursor:input.trim()&&!busy?"pointer":"default",background:input.trim()&&!busy?"#4F6EF7":"#E8ECF4",color:input.trim()&&!busy?"#fff":"#8C96B0",fontSize:12,fontWeight:700,fontFamily:"'DM Sans',sans-serif" }}>Ask</button>
      </div>
    </div>
  );
}

/* ── KPI CARDS ────────────────────────────────────────────── */
function KPICards({ stats }) {
  const { totalBudget=0, totalSpent=0, burnRate=0, opexBudget=0, capexBudget=0 } = stats;
  const pct = totalBudget>0?((totalSpent/totalBudget)*100).toFixed(1):0;
  const mo  = new Date().getMonth()+1;
  const cards = [
    { icon:"📋", label:"Total Budget",  value:fmtK(totalBudget), sub:"Approved allocation",    accent:"#4F6EF7" },
    { icon:"💸", label:"Total Spent",   value:fmtK(totalSpent),  sub:`${pct}% utilised`,       accent:"#8B5CF6" },
    { icon:"🔥", label:"Avg Burn / Mo", value:fmtK(burnRate),    sub:`Across ${mo} months`,    accent:"#F43F6E" },
    { icon:"🏢", label:"Opex Budget",   value:opexBudget>0?fmtK(opexBudget):"₹0", sub:"Operating expenditure", accent:"#4F6EF7" },
    { icon:"🏗",  label:"Capex Budget", value:capexBudget>0?fmtK(capexBudget):"₹0", sub:"Capital expenditure",  accent:"#0EA5A0" },
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:14 }}>
      {cards.map((c,i) => (
        <div key={i} style={{ background:"#fff", border:"1px solid #E8ECF4", borderRadius:14, padding:"16px 18px", boxShadow:"0 1px 4px rgba(0,0,0,0.04)", position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:12, right:14, fontSize:20, opacity:0.1 }}>{c.icon}</div>
          <div style={{ fontSize:9, color:"#8C96B0", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:"'DM Sans',sans-serif", marginBottom:6 }}>{c.label}</div>
          <div style={{ fontSize:22, fontWeight:900, color:c.accent, fontFamily:"'Plus Jakarta Sans',sans-serif", lineHeight:1.1 }}>{c.value}</div>
          <div style={{ fontSize:10, color:"#8C96B0", fontFamily:"'DM Sans',sans-serif", marginTop:4 }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ── PROCUREMENT FLOW ─────────────────────────────────────── */
const SC = {
  done:    { bg:"#F0FDF4", border:"#86EFAC", text:"#10B981", dot:"#10B981" },
  pending: { bg:"#FFFBEB", border:"#FDE68A", text:"#F59E0B", dot:"#F59E0B" },
  none:    { bg:"#F8FAFF", border:"#E8ECF4", text:"#8C96B0", dot:"#D1D5DB" },
};
function StagePill({ label, status }) {
  const c = SC[status]||SC.none;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:20, border:`1.5px solid ${c.border}`, background:c.bg, whiteSpace:"nowrap" }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:c.dot, flexShrink:0 }}/>
      <span style={{ fontSize:10, fontWeight:600, color:c.text, fontFamily:"'DM Sans',sans-serif" }}>{label}</span>
      {status==="done"&&<span style={{ fontSize:9, color:c.text }}>✓</span>}
      {status==="pending"&&<span style={{ fontSize:9, color:c.text }}>…</span>}
    </div>
  );
}
function StageRow({ stages }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
      {stages.map((s,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:4 }}>
          <StagePill label={s.label} status={s.status}/>
          {i<stages.length-1&&<span style={{ color:"#CBD5E1", fontSize:11, flexShrink:0 }}>→</span>}
        </div>
      ))}
    </div>
  );
}
function buildStages(s={}) {
  return [
    { label:"Budget",       status:"done" },
    { label:"NFA Raised",   status:s.nfaRaised?"done":"pending" },
    { label:"NFA Approved", status:s.nfaApproved?"done":s.nfaRaised?"pending":"none" },
    { label:"Vendor",       status:s.vendor?"done":"none" },
    { label:"Invoice",      status:s.invoice?"done":"none" },
    { label:"Payment",      status:s.payment?"done":s.paymentPartial?"pending":"none" },
  ];
}
function ProjRow({ project }) {
  const [open, setOpen] = useState(false);
  const hasSubs = (project.subs||[]).length>0;
  const s = project.stages||{};
  const done = [s.budget,s.nfaRaised,s.nfaApproved,s.vendor,s.invoice,s.payment].filter(Boolean).length;
  const stages = buildStages(s);
  return (
    <div style={{ borderBottom:"1px solid #E8ECF4" }}>
      <div onClick={()=>hasSubs&&setOpen(o=>!o)}
        style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 20px", cursor:hasSubs?"pointer":"default", transition:"background 0.12s" }}
        onMouseEnter={e=>e.currentTarget.style.background="#F7F9FF"}
        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        {hasSubs
          ? <span style={{ display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,borderRadius:4,background:open?"#4F6EF7":"#EEF2FF",color:open?"#fff":"#4F6EF7",fontSize:8,fontWeight:900,flexShrink:0 }}>{open?"▼":"▶"}</span>
          : <span style={{ width:18,flexShrink:0 }}/>}
        <div style={{ width:190, flexShrink:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#1A2035", fontFamily:"'Plus Jakarta Sans',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{project.name}</div>
          <div style={{ fontSize:10, color:"#8C96B0", fontFamily:"'DM Sans',sans-serif" }}>{project.businessUnit} · {project.budgetType}</div>
        </div>
        <div style={{ width:88, flexShrink:0 }}>
          <div style={{ fontSize:8, color:"#8C96B0", fontWeight:700, textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.08em" }}>Budget</div>
          <div style={{ fontSize:13, fontWeight:800, color:"#4F6EF7", fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{fmtK(project.allocated)}</div>
        </div>
        <div style={{ width:44, flexShrink:0 }}>
          <span style={{ display:"inline-flex",alignItems:"center",gap:3,background:done===6?"#F0FDF4":"#EEF2FF",border:`1px solid ${done===6?"#86EFAC":"#C7D2FE"}`,borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700,color:done===6?"#10B981":"#4F6EF7" }}>
            <span style={{ width:4,height:4,borderRadius:"50%",background:done===6?"#10B981":"#4F6EF7" }}/>{done}/6
          </span>
        </div>
        <div style={{ flex:1, minWidth:0 }}><StageRow stages={stages}/></div>
      </div>
      {open&&hasSubs&&(
        <div style={{ paddingBottom:8 }}>
          {project.subs.map(sub => (
            <div key={sub.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 20px 8px 54px", borderLeft:"2px solid #E8ECF4", marginLeft:20 }}>
              <div style={{ width:168 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#4A5578", fontFamily:"'DM Sans',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sub.name}</div>
                <div style={{ fontSize:10, color:"#8C96B0" }}>{fmtK(sub.allocated)}</div>
              </div>
              <div style={{ flex:1, minWidth:0 }}><StageRow stages={buildStages(sub.stages||{})}/></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function ProcurementFlow({ projects }) {
  const [fBU,  setFBU]  = useState("");
  const [fPrj, setFPrj] = useState("");
  const [fTyp, setFTyp] = useState("");
  const BUs  = [...new Set(projects.map(p=>p.businessUnit).filter(Boolean))];
  const rows = projects.filter(p=>(!fBU||p.businessUnit===fBU)&&(!fPrj||p.id===fPrj)&&(!fTyp||(p.budgetType||"").toLowerCase()===fTyp.toLowerCase()));
  const sel  = {...IS,width:148,fontSize:11,background:"#fff"};
  return (
    <div style={{ background:"#fff", border:"1px solid #E8ECF4", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ padding:"16px 20px 12px", borderBottom:"1px solid #E8ECF4" }}>
        <div style={{ fontSize:15, fontWeight:800, color:"#1A2035", fontFamily:"'Plus Jakarta Sans',sans-serif", marginBottom:2 }}>Project Lifecycle</div>
        <div style={{ fontSize:11, color:"#8C96B0", fontFamily:"'DM Sans',sans-serif", marginBottom:12 }}>Budget → NFA Raised → NFA Approved → Vendor → Invoice → Payment</div>
        <div style={{ display:"flex", gap:16, marginBottom:12 }}>
          {[["#10B981","Completed"],["#F59E0B","Pending"],["#D1D5DB","Not Started"]].map(([dot,lbl]) => (
            <div key={lbl} style={{ display:"flex",alignItems:"center",gap:5 }}>
              <span style={{ width:7,height:7,borderRadius:"50%",background:dot }}/>
              <span style={{ fontSize:11,color:"#8C96B0",fontFamily:"'DM Sans',sans-serif" }}>{lbl}</span>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <select value={fBU}  onChange={e=>setFBU(e.target.value)}  style={sel}><option value="">All BU</option>{BUs.map(o=><option key={o}>{o}</option>)}</select>
          <select value={fPrj} onChange={e=>setFPrj(e.target.value)} style={{...sel,width:175}}><option value="">All Projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={fTyp} onChange={e=>setFTyp(e.target.value)} style={sel}><option value="">Opex / Capex</option><option>Opex</option><option>Capex</option></select>
          <button onClick={()=>{setFBU("");setFPrj("");setFTyp("");}} style={{ padding:"7px 16px",borderRadius:8,border:"1px solid #E8ECF4",background:"#F7F8FC",cursor:"pointer",fontSize:11,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:"#4A5578" }}>Clear</button>
        </div>
      </div>
      {rows.length===0
        ? <div style={{ padding:32,textAlign:"center",color:"#8C96B0",fontSize:13,fontFamily:"'DM Sans',sans-serif" }}>No projects match filters.</div>
        : rows.map(p=><ProjRow key={p.id} project={p}/>)}
    </div>
  );
}

/* ── GAUGE ARC ────────────────────────────────────────────── */
function GaugeArc({ pct=0 }) {
  const u=Math.min(Math.max(Number(pct)||0,0),100);
  const isCrit=u>85,isWarn=u>60;
  const accent=isCrit?"#F43F6E":isWarn?"#F59E0B":"#10B981";
  const accentB=isCrit?"#FF8FAB":isWarn?"#FCD34D":"#34D399";
  const W=130,H=78,cx=65,cy=H-8,R=52,sw=9;
  const pt=(deg,r)=>({x:cx+r*Math.cos((deg*Math.PI)/180),y:cy-r*Math.sin((deg*Math.PI)/180)});
  const s0=pt(180,R),e0=pt(0,R);
  const trackPath=`M ${s0.x.toFixed(2)} ${s0.y.toFixed(2)} A ${R} ${R} 0 0 1 ${e0.x.toFixed(2)} ${e0.y.toFixed(2)}`;
  const sweepDeg=(u/100)*180,endDeg=180-sweepDeg,ef=pt(endDeg,R);
  const filledPath=sweepDeg>1?`M ${s0.x.toFixed(2)} ${s0.y.toFixed(2)} A ${R} ${R} 0 0 1 ${ef.x.toFixed(2)} ${ef.y.toFixed(2)}`:null;
  const gId="hgGFix",glId="hgGlFix";
  return (
    <svg width={W} height={H} style={{ display:"block",flexShrink:0,overflow:"visible" }}>
      <defs>
        <linearGradient id={gId} x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={accent}/><stop offset="100%" stopColor={accentB}/></linearGradient>
        <filter id={glId} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} strokeLinecap="round"/>
      {filledPath&&<path d={filledPath} fill="none" stroke={`url(#${gId})`} strokeWidth={sw} strokeLinecap="round" filter={`url(#${glId})`}/>}
      {sweepDeg>1&&<circle cx={ef.x.toFixed(2)} cy={ef.y.toFixed(2)} r={5} fill={accent} stroke="rgba(255,255,255,0.9)" strokeWidth={2} filter={`url(#${glId})`}/>}
    </svg>
  );
}

/* ── HERO HEADER ──────────────────────────────────────────── */
function DashHeader({ stats, period, setPeriod }) {
  const { totalBudget=0, totalSpent=0, remaining=0, burnRate=0 } = stats||{};
  const u      = totalBudget>0?(totalSpent/totalBudget)*100:0;
  const runway = burnRate>0?Math.round(remaining/burnRate):null;
  const isOk   = u<85;
  const PERIODS = ["This Month","Quarter",FY];
  return (
    <div style={{ background:"linear-gradient(135deg,#F8FAFF 0%,#EFF6FF 55%,#F5F3FF 100%)", border:"1px solid #DBEAFE", borderRadius:18, padding:"20px 26px 18px", marginBottom:14, boxShadow:"0 2px 16px rgba(59,130,246,0.08)", position:"relative", overflow:"hidden", display:"flex", alignItems:"center", gap:20 }}>
      <div style={{ flex:1, position:"relative", zIndex:1 }}>
        <div style={{ position:"absolute", top:0, right:0, display:"flex", gap:3, background:"rgba(59,130,246,0.07)", border:"1px solid #BFDBFE", borderRadius:22, padding:"3px 4px" }}>
          {PERIODS.map(p => (
            <button key={p} onClick={()=>setPeriod(p)} style={{ padding:"3px 12px",borderRadius:18,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,background:period===p?"#1D4ED8":"transparent",color:period===p?"#fff":"#64748B",transition:"all 0.15s" }}>{p}</button>
          ))}
        </div>
        <div style={{ fontSize:24, fontWeight:900, color:"#0F172A", fontFamily:"'Plus Jakarta Sans',sans-serif", lineHeight:1.15, letterSpacing:"-0.02em", marginBottom:3, marginTop:8 }}>
          AI-Powered Budget Intelligence <span style={{ color:"#2563EB" }}>.</span>
        </div>
        <div style={{ fontSize:12, color:"#64748B", fontFamily:"'DM Sans',sans-serif" }}>Real-time spend analytics &amp; governance</div>
      </div>
      <div style={{ flexShrink:0, background:"linear-gradient(135deg,#0f172a 0%,#1e2d50 55%,#1a3856 100%)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"14px 20px", display:"flex", gap:16, alignItems:"center", zIndex:1, boxShadow:"0 4px 20px rgba(15,23,42,0.2)" }}>
        <GaugeArc pct={u}/>
        <div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.4)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:"'DM Sans',sans-serif", marginBottom:3 }}>Remaining</div>
          <div style={{ fontSize:22, fontWeight:900, color:"#fff", fontFamily:"'Plus Jakarta Sans',sans-serif", lineHeight:1 }}>{fmtK(remaining)}</div>
          {runway!==null&&<div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", fontFamily:"'DM Sans',sans-serif", marginTop:5 }}>~{runway} mo runway</div>}
          <div style={{ marginTop:8 }}>
            <span style={{ display:"inline-flex",alignItems:"center",gap:4,background:isOk?"rgba(16,185,129,0.18)":"rgba(244,63,110,0.18)",border:`1px solid ${isOk?"rgba(16,185,129,0.35)":"rgba(244,63,110,0.35)"}`,borderRadius:20,padding:"3px 10px" }}>
              <span style={{ fontSize:9 }}>{isOk?"✓":"⚠"}</span>
              <span style={{ fontSize:9,fontWeight:700,color:isOk?"#6EE7B7":"#FCA5A5",fontFamily:"'DM Sans',sans-serif" }}>{isOk?"ON TRACK":"AT RISK"}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── RUN VS CHANGE ────────────────────────────────────────── */
function RunVsChangeChart({ analytics }) {
  const { runTotal={}, changeByBU={} } = analytics||{};
  const runAmt    = Object.values(runTotal).reduce((s,v)=>s+v,0);
  const changeAmt = Object.values(changeByBU).reduce((s,v)=>s+v,0);
  const total     = runAmt+changeAmt||1;
  const buList    = Object.keys(changeByBU).filter(bu=>changeByBU[bu]>0).sort((a,b)=>changeByBU[b]-changeByBU[a]);
  const runPct    = ((runAmt/total)*100).toFixed(1);
  const changePct = ((changeAmt/total)*100).toFixed(1);
  const maxBU     = buList.length>0?changeByBU[buList[0]]:1;
  if (runAmt===0&&changeAmt===0) return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>
      <div style={{ background:"#fff",border:"1px solid #E8ECF4",borderRadius:16,padding:24,gridColumn:"1/-1",display:"flex",alignItems:"center",gap:12 }}>
        <div style={{ width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#EEF2FF,#E0E7FF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>📊</div>
        <div>
          <div style={{ fontSize:13,fontWeight:700,color:"#1A2035",fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Run vs Change Budget</div>
          <div style={{ fontSize:11,color:"#8C96B0",fontFamily:"'DM Sans',sans-serif",marginTop:2 }}>Tag projects with Classification of Spend to see the breakdown here.</div>
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
      <div style={{ background:"#fff",border:"1px solid #E8ECF4",borderRadius:16,padding:"22px 24px",boxShadow:"0 2px 12px rgba(79,110,247,0.07)" }}>
        <div style={{ fontSize:14,fontWeight:800,color:"#1A2035",fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:8 }}>Run vs Change Budget</div>
        <div style={{ height:36,borderRadius:10,overflow:"hidden",display:"flex",background:"#F1F5F9" }}>
          {runAmt>0&&<div style={{ width:`${runPct}%`,background:"linear-gradient(90deg,#4F6EF7,#818CF8)",display:"flex",alignItems:"center",paddingLeft:14,borderRadius:"10px 0 0 10px",minWidth:60 }}><span style={{ fontSize:11,fontWeight:800,color:"#fff",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>Run {runPct}%</span></div>}
          {changeAmt>0&&<div style={{ flex:1,background:"linear-gradient(90deg,#8B5CF6,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:14,borderRadius:runAmt>0?"0 10px 10px 0":"10px",minWidth:40 }}><span style={{ fontSize:11,fontWeight:800,color:"#fff",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>{changePct}%</span></div>}
        </div>
        <div style={{ display:"flex",gap:12,marginTop:10,fontSize:11,color:"#4A5578",fontFamily:"'DM Sans',sans-serif" }}>
          <span><b style={{ color:"#4F6EF7" }}>Run:</b> {fmtK(runAmt)}</span>
          <span><b style={{ color:"#8B5CF6" }}>Change:</b> {fmtK(changeAmt)}</span>
        </div>
      </div>
      <div style={{ background:"#fff",border:"1px solid #E8ECF4",borderRadius:16,padding:"22px 24px",boxShadow:"0 2px 12px rgba(139,92,246,0.07)" }}>
        <div style={{ fontSize:14,fontWeight:800,color:"#1A2035",fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4 }}>Change Spend by Department</div>
        {buList.length===0
          ? <div style={{ fontSize:11,color:"#8C96B0",fontFamily:"'DM Sans',sans-serif",padding:"16px 0" }}>No Change-classified projects with BU tags yet.</div>
          : <div style={{ display:"flex",flexDirection:"column",gap:12,marginTop:12 }}>
            {buList.slice(0,6).map((bu,i)=>{
              const amt=changeByBU[bu],pct=((amt/maxBU)*100).toFixed(0);
              const colors=[["#4F6EF7","#818CF8"],["#7C3AED","#A78BFA"],["#6366F1","#C4B5FD"],["#3B82F6","#93C5FD"],["#8B5CF6","#DDD6FE"],["#4F46E5","#A5B4FC"]];
              const [c1,c2]=colors[i%colors.length];
              return (
                <div key={bu} style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:11,fontWeight:600,color:"#4A5578",fontFamily:"'DM Sans',sans-serif",width:72,flexShrink:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{bu}</span>
                  <div style={{ flex:1,height:8,background:"#F1F5F9",borderRadius:4,overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${c1},${c2})`,borderRadius:4 }}/>
                  </div>
                  <span style={{ fontSize:11,fontWeight:700,color:"#4A5578",fontFamily:"'DM Sans',sans-serif",width:38,textAlign:"right",flexShrink:0 }}>{fmtK(amt)}</span>
                </div>
              );
            })}
          </div>
        }
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [period,  setPeriod]  = useState(FY);

  useEffect(() => {
    fetch("/api/dashboard/full", { headers: hdr() })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d  => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  if (loading) return <DashSkeleton />;
  if (error||!data) return (
    <div style={{ padding:40, textAlign:"center", color:"#F43F6E", fontFamily:"'DM Sans',sans-serif" }}>
      Failed to load dashboard. {error}
    </div>
  );

  const { stats={}, analytics={}, aiSummary=[], procurementFlow=[], recentActivities=[] } = data;
  const buBudget    = analytics.buBudget    || {};
  const buSpend     = analytics.buSpend     || {};
  const vendorSpend = analytics.vendorSpend || {};
  const buData = Object.entries(buBudget)
    .map(([bu,budget]) => ({ name:bu.length>10?bu.slice(0,10)+"…":bu, Budget:budget, Spend:buSpend[bu]||0 }))
    .sort((a,b)=>b.Budget-a.Budget).slice(0,8);

  return (
    <div className="dbin" style={{ padding:"28px 44px", maxWidth:1400, margin:"0 auto", boxSizing:"border-box" }}>
      <DashHeader stats={stats} period={period} setPeriod={setPeriod} />
      <AIInsightStrip stats={stats} aiSummary={aiSummary} />
      <KPICards stats={stats} />
      <RunVsChangeChart analytics={analytics} />

      {/* BU CHART + ASK AI */}
      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1.6fr) minmax(0,1fr)", gap:14, marginBottom:14 }}>
        <div style={{ background:"#fff", border:"1px solid #E8ECF4", borderRadius:14, padding:"18px 20px", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
          <SLabel color="#4F6EF7">Business Unit — Budget vs Expense ({FY})</SLabel>
          {buData.length===0
            ? <div style={{ height:180,display:"flex",alignItems:"center",justifyContent:"center",color:"#8C96B0",fontSize:12,fontFamily:"'DM Sans',sans-serif" }}>No data yet.</div>
            : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={buData} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF4" vertical={false}/>
                  <XAxis dataKey="name" tick={{ fontSize:9,fill:"#8C96B0",fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={v=>fmtK(v)} tick={{ fontSize:9,fill:"#8C96B0",fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false} width={52}/>
                  <Tooltip formatter={v=>fmtK(v)} contentStyle={{ borderRadius:10,border:"1px solid #E8ECF4",fontSize:11 }}/>
                  <Bar dataKey="Budget" fill="#4F6EF7" radius={[4,4,0,0]} opacity={0.9}/>
                  <Bar dataKey="Spend"  fill="#8B5CF6" radius={[4,4,0,0]} opacity={0.9}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
        <div style={{ background:"linear-gradient(180deg,#FFFFFF 0%,#F8FAFF 100%)", border:"1px solid #E8ECF4", borderRadius:14, padding:"16px 18px", boxShadow:"0 6px 18px rgba(79,110,247,0.08)" }}>
          <AskAI stats={stats} aiSummary={aiSummary} compact />
        </div>
      </div>

      {procurementFlow.length>0&&(
        <div style={{ marginBottom:14 }}>
          <ProcurementFlow projects={procurementFlow}/>
        </div>
      )}

      {recentActivities.length>0&&(
        <div style={{ background:"#fff", border:"1px solid #E8ECF4", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ padding:"13px 20px", borderBottom:"1px solid #E8ECF4" }}>
            <div style={{ fontSize:13,fontWeight:700,color:"#1A2035",fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Recent Activity</div>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><TH>Event</TH><TH>Vendor</TH><TH right>Amount</TH><TH>When</TH></tr></thead>
            <tbody>
              {recentActivities.map((a,i) => (
                <tr key={i} onMouseEnter={e=>e.currentTarget.style.background="#F7F9FF"} onMouseLeave={e=>e.currentTarget.style.background="transparent"} style={{ transition:"background 0.12s" }}>
                  <TD>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <span style={{ width:6,height:6,borderRadius:"50%",background:a.type==="payment"?"#10B981":"#4F6EF7",flexShrink:0 }}/>
                      <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200 }}>{a.label}</span>
                    </div>
                  </TD>
                  <TD>{a.vendor}</TD>
                  <TD right bold>{fmtK(a.amount)}</TD>
                  <TD>{a.date?timeAgo(a.date):"—"}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}