/* ─────────────────────────────────────────────────────────────
   shared.jsx  —  Design tokens, helpers, and shared UI atoms
   Import from each page: import { T, fmtK, ... } from './shared'
───────────────────────────────────────────────────────────── */
import { useState } from "react";

/* ── Tokens ─────────────────────────────────────────────────── */
export const T = {
  bg:"#F7F8FC", card:"#FFFFFF", border:"#E8ECF4",
  text:"#1A2035", sub:"#4A5578", muted:"#8C96B0",
  indigo:"#4F6EF7", violet:"#8B5CF6", teal:"#0EA5A0",
  rose:"#F43F6E", amber:"#F59E0B", emerald:"#10B981",
  orange:"#F97316",
};
export const PALETTE = [T.indigo,T.violet,T.teal,T.rose,T.amber,T.orange,T.emerald];
export const FY_MONTHS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
export const MONTH_COLORS = {Apr:"#6366F1",May:"#8B5CF6",Jun:"#EC4899",Jul:"#F43F6E",Aug:"#F97316",Sep:"#F59E0B",Oct:"#10B981",Nov:"#14B8A6",Dec:"#06B6D4",Jan:"#3B82F6",Feb:"#4F6EF7",Mar:"#7C3AED"};

/* ── Helpers ─────────────────────────────────────────────────── */
export const fmt  = v => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
export const fmtK = v => { const n=Number(v||0); if(n>=10000000)return`₹${(n/10000000).toFixed(1)}Cr`; if(n>=100000)return`₹${(n/100000).toFixed(1)}L`; if(n>=1000)return`₹${(n/1000).toFixed(0)}k`; return`₹${n}`; };
export const pct  = (a,b) => b ? ((a/b)*100).toFixed(1) : "0.0";
export const today = () => new Date().toISOString().split("T")[0];

export function timeAgo(date) {
  if(!date)return"—";
  const diff=Math.floor((new Date()-new Date(date))/1000);
  if(diff<3600)return`${Math.floor(diff/60)||1}m ago`;
  if(diff<86400)return`${Math.floor(diff/3600)}h ago`;
  if(diff<172800)return"Yesterday";
  if(diff<604800)return`${Math.floor(diff/86400)}d ago`;
  return new Date(date).toLocaleDateString("en-IN",{day:"numeric",month:"short"});
}

export function genId(prefix,list,field="id") {
  const yr=String(new Date().getFullYear()).slice(-2);
  const max=list.reduce((m,x)=>{
    const n=parseInt((x[field]||"").replace(/\D/g,"").slice(-4)||"0");
    return Math.max(m,n);
  },0);
  return `${prefix}${yr}${String(max+1).padStart(4,"0")}`;
}

export function projectStatus(spent,allocated) {
  if(!allocated)return{label:"Active",color:T.indigo,bg:"#EEF2FF"};
  const r=spent/allocated;
  if(r>1)return{label:"Overrun",color:T.rose,bg:"#FFF1F3"};
  if(r>=1)return{label:"Fully Utilised",color:T.amber,bg:"#FFFBEB"};
  return{label:"Active",color:T.emerald,bg:"#F0FDF4"};
}

/* ── Shared UI atoms ─────────────────────────────────────────── */
export function Tip({children,text,dir="up"}){
  const [on,setOn]=useState(false);
  const pos=dir==="up"?{bottom:"calc(100% + 8px)"}:{top:"calc(100% + 8px)"};
  return(
    <div style={{position:"relative",display:"inline-block"}} onMouseEnter={()=>setOn(true)} onMouseLeave={()=>setOn(false)}>
      {children}
      {on&&text&&<div style={{position:"absolute",...pos,left:"50%",transform:"translateX(-50%)",background:"#1A2035",color:"#fff",borderRadius:8,padding:"6px 10px",fontSize:11,fontFamily:"'DM Sans',sans-serif",lineHeight:1.5,maxWidth:220,whiteSpace:"normal",zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.2)",pointerEvents:"none",minWidth:120}}>
        {text}
        <div style={{position:"absolute",...(dir==="up"?{top:"100%"}:{bottom:"100%"}),left:"50%",transform:"translateX(-50%)",borderLeft:"5px solid transparent",borderRight:"5px solid transparent",...(dir==="up"?{borderTop:"5px solid #1A2035"}:{borderBottom:"5px solid #1A2035"})}}/>
      </div>}
    </div>
  );
}

export const Card=({children,style={}})=>(
  <div style={{background:T.card,borderRadius:16,padding:22,border:`1px solid ${T.border}`,boxShadow:"0 1px 3px rgba(0,0,0,0.04),0 4px 16px rgba(79,110,247,0.05)",...style}}>{children}</div>
);

export const SLabel=({children,color=T.indigo})=>(
  <div style={{fontSize:10,fontWeight:700,color:T.sub,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:14,display:"flex",alignItems:"center",gap:7,fontFamily:"'DM Sans',sans-serif"}}>
    <span style={{width:3,height:12,background:color,borderRadius:2,display:"inline-block"}}/>
    {children}
  </div>
);

export const Badge=({label,color,bg})=>(
  <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 9px",borderRadius:20,background:bg,fontSize:10,fontWeight:600,color,fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>
    <span style={{width:5,height:5,borderRadius:"50%",background:color,display:"inline-block"}}/>
    {label}
  </span>
);

export const TH=({children,right})=>(
  <th style={{padding:"9px 12px",textAlign:right?"right":"left",fontSize:9,fontWeight:700,color:T.muted,letterSpacing:"0.09em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",borderBottom:`1px solid ${T.border}`,background:"#FAFBFF",whiteSpace:"nowrap"}}>{children}</th>
);

export const TD=({children,right,bold,color,style:s={}})=>(
  <td style={{padding:"10px 12px",textAlign:right?"right":"left",fontSize:12,fontWeight:bold?700:400,color:color||T.text,fontFamily:bold?"'Plus Jakarta Sans',sans-serif":"'DM Sans',sans-serif",borderBottom:`1px solid ${T.border}`,verticalAlign:"middle",...s}}>{children}</td>
);

export const IS={width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid #E8ECF4`,fontSize:12,fontFamily:"'DM Sans',sans-serif",color:"#1A2035",background:"#fff",outline:"none",boxSizing:"border-box"};

export function Field({label,required,children}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      <label style={{fontSize:10,fontWeight:700,color:"#4A5578",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>
        {label}{required&&<span style={{color:"#F43F6E",marginLeft:2}}>*</span>}
      </label>
      {children}
    </div>
  );
}

export function Modal({title,onClose,children,width=640}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(26,32,53,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onClose}>
      <div style={{background:"#FFFFFF",borderRadius:18,width:"100%",maxWidth:width,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(26,32,53,0.28)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 26px 0"}}>
          <h3 style={{fontSize:16,fontWeight:800,color:"#1A2035",fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:"-0.02em"}}>{title}</h3>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:8,border:`1px solid #E8ECF4`,background:"#F7F8FC",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#8C96B0",fontSize:16,fontWeight:700}}>×</button>
        </div>
        <div style={{padding:"18px 26px 26px"}}>{children}</div>
      </div>
    </div>
  );
}

export function Btn({onClick,children,variant="primary",small,disabled,style:s={}}){
  const base={padding:small?"5px 14px":"8px 20px",borderRadius:8,border:"none",cursor:disabled?"not-allowed":"pointer",fontSize:small?11:12,fontWeight:700,fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",opacity:disabled?0.5:1,...s};
  const v={
    primary:{background:"#4F6EF7",color:"#fff"},
    secondary:{background:"#F7F8FC",color:"#4A5578",border:`1px solid #E8ECF4`},
    danger:{background:"#FFF1F3",color:"#F43F6E",border:`1px solid #FCA5A5`},
    success:{background:"#F0FDF4",color:"#10B981",border:`1px solid #A7F3D0`},
  };
  return<button onClick={onClick} disabled={disabled} style={{...base,...v[variant]}}>{children}</button>;
}

export function SearchBar({value,onChange,placeholder}){
  return(
    <div style={{position:"relative",flex:1,maxWidth:280}}>
      <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}} width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#8C96B0" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||"Search…"} style={{...IS,paddingLeft:30,background:"#FAFBFF"}}/>
    </div>
  );
}

export function PageHeader({title,sub,badge,actions}){
  return(
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,paddingBottom:20,borderBottom:`1px solid #E8ECF4`}}>
      <div>
        {badge&&<div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#10B981"}}/>
          <span style={{fontSize:10,color:"#10B981",fontWeight:700,letterSpacing:"0.12em",fontFamily:"'DM Sans',sans-serif"}}>{badge}</span>
        </div>}
        <h1 style={{fontSize:24,fontWeight:800,color:"#1A2035",letterSpacing:"-0.03em",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.1}}>{title}<span style={{color:"#4F6EF7"}}>.</span></h1>
        {sub&&<p style={{fontSize:12,color:"#8C96B0",marginTop:4,fontFamily:"'DM Sans',sans-serif"}}>{sub}</p>}
      </div>
      {actions&&<div style={{display:"flex",gap:8,alignItems:"center"}}>{actions}</div>}
    </div>
  );
}

export const PAGE_STYLE = {padding:"32px 36px",maxWidth:1400};

export const SUMMARY_CARD = (items) => (
  <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
    {items.map((s,i)=>(
      <div key={i} style={{background:"#FFFFFF",border:`1px solid #E8ECF4`,borderRadius:10,padding:"10px 18px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
        <div style={{fontSize:9,color:"#8C96B0",fontWeight:700,letterSpacing:"0.09em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",marginBottom:4}}>{s.label}</div>
        <div style={{fontSize:17,fontWeight:800,color:s.color,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{s.value}</div>
      </div>
    ))}
  </div>
);