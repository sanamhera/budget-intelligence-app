import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── keyframes & responsive ── */
if (typeof document !== 'undefined' && !document.getElementById('lkf')) {
  const s = document.createElement('style');
  s.id = 'lkf';
  s.textContent = `
    @keyframes lUp  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
    @keyframes lOrb { 0%,100%{transform:scale(1) translate(0,0)} 50%{transform:scale(1.06) translate(6px,-8px)} }
    @keyframes lFlt { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-10px)} }
    @keyframes lFl2 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-6px)} }
    @keyframes lShim{ 0%{background-position:200% 50%} 100%{background-position:-200% 50%} }
    @keyframes lSpin{ from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    .lup { animation: lUp 0.5s ease both; }
    .l1{animation-delay:.05s} .l2{animation-delay:.1s} .l3{animation-delay:.15s} .l4{animation-delay:.22s} .l5{animation-delay:.28s}
    .lflt  { animation: lFlt 4s ease-in-out infinite; }
    .lflt2 { animation: lFl2 5s ease-in-out infinite; animation-delay: 1s; }
    .lin:focus { border-color:#4F6EF7!important; box-shadow:0 0 0 3px rgba(79,110,247,.18)!important; outline:none!important; }
    .ltab-btn { transition: background 0.2s, color 0.2s, box-shadow 0.2s; }
    .lsubmit:not(:disabled):hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(79,110,247,.5)!important; }
    .lsubmit { transition: all 0.18s; }
    .lnum { filter: blur(7px); user-select: none; transition: filter 0.35s ease; display: inline-block; }
    .lnum:hover { filter: blur(3px); }
    @media (max-width: 860px) { .l-left { display:none!important; } .l-right { flex: 1!important; } }
  `;
  document.head.appendChild(s);
}

/* ── icons ── */
const EyeOn  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const EyeOff = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10 10 0 0112 20c-7 0-11-8-11-8a18 18 0 015.06-5.94M9.9 4.24A9 9 0 0112 4c7 0 11 8 11 8a18 18 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

const AppLogo = ({ size = 36 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: 'linear-gradient(135deg,#4F6EF7,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(79,110,247,0.45)', flexShrink: 0 }}>
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.95"/>
      <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" opacity="0.55"/>
    </svg>
  </div>
);

/* ── mock dashboard card shown on left panel ── */
function DashboardMock() {
  const bars = [
    { h: 42, c: '#4F6EF7' }, { h: 68, c: '#4F6EF7' }, { h: 53, c: '#4F6EF7' },
    { h: 82, c: '#8B5CF6' }, { h: 61, c: '#4F6EF7' }, { h: 77, c: '#4F6EF7' }, { h: 90, c: '#8B5CF6' },
  ];
  return (
    <div className="lflt" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '22px 24px', maxWidth: 360, width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans',sans-serif", marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total Budget FY 26-27</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', fontFamily: "'Plus Jakarta Sans',sans-serif", letterSpacing: '-0.025em', lineHeight: 1 }}><span className="lnum">₹24.6 Cr</span></div>
        </div>
        <div style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#34D399', fontFamily: "'DM Sans',sans-serif" }}><span className="lnum">↑ 12.4%</span></span>
        </div>
      </div>

      {/* Bar chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64, marginBottom: 14 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, height: `${b.h}%`, background: `linear-gradient(180deg, ${b.c}CC, ${b.c}55)`, borderRadius: '3px 3px 0 0', border: `1px solid ${b.c}44`, borderBottom: 'none' }} />
        ))}
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 14 }} />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[
          { label: 'Spent',      value: '₹11.2Cr', color: '#A78BFA' },
          { label: 'Remaining',  value: '₹13.4Cr', color: '#34D399' },
          { label: 'Utilised',   value: '45.5%',   color: '#FBB040'  },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: s.color, fontFamily: "'DM Sans',sans-serif", lineHeight: 1 }}><span className="lnum">{s.value}</span></div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: "'DM Sans',sans-serif", marginTop: 3, letterSpacing: '0.04em' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── secondary floating card ── */
function ActivityCard() {
  return (
    <div className="lflt2" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 280 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(79,110,247,0.25)', border: '1px solid rgba(79,110,247,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 16 }}>✅</span>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: "'DM Sans',sans-serif" }}>NFA Approved</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans',sans-serif", marginTop: 1 }}>IT Infrastructure · <span className="lnum">₹4.2L</span></div>
      </div>
      <div style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap' }}>2m ago</div>
    </div>
  );
}

/* ── left branding panel ── */
function LeftPanel() {
  return (
    <div className="l-left" style={{ flex: '0 0 56%', position: 'relative', overflow: 'hidden', background: 'linear-gradient(150deg,#060914 0%,#0E1535 30%,#180E42 58%,#1E0B52 100%)', display: 'flex', flexDirection: 'column' }}>

      {/* Ambient glow orbs */}
      <div style={{ position: 'absolute', top: -100, right: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle,rgba(79,110,247,0.22) 0%,transparent 70%)', animation: 'lOrb 7s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -60, left: -100, width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.18) 0%,transparent 70%)', animation: 'lOrb 9s ease-in-out infinite', animationDelay: '3s', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '45%', left: '25%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(16,185,129,0.1) 0%,transparent 70%)', animation: 'lOrb 5.5s ease-in-out infinite', animationDelay: '1.5s', pointerEvents: 'none' }} />

      {/* Grid overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '52px 52px', pointerEvents: 'none' }} />

      {/* Diagonal shimmer line */}
      <div style={{ position: 'absolute', top: 0, left: '-20%', width: '40%', height: '100%', background: 'linear-gradient(105deg,transparent 40%,rgba(79,110,247,0.04) 50%,transparent 60%)', pointerEvents: 'none' }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '40px 48px 44px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AppLogo size={36} />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans',sans-serif", letterSpacing: '-0.01em' }}>Budget Intelligence</span>
        </div>

        {/* Hero headline */}
        <div style={{ marginTop: 52, marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: 'rgba(79,110,247,0.15)', border: '1px solid rgba(79,110,247,0.28)', marginBottom: 18 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4F6EF7', boxShadow: '0 0 6px #4F6EF7' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#7C9FF7', letterSpacing: '0.09em', textTransform: 'uppercase', fontFamily: "'DM Sans',sans-serif" }}>Financial Governance Platform</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, color: '#fff', lineHeight: 1.18, fontFamily: "'Plus Jakarta Sans',sans-serif", letterSpacing: '-0.025em' }}>
            Smart Budgets.<br />
            <span style={{ background: 'linear-gradient(90deg,#7EB3FF 0%,#B09EFF 45%,#5EEAD4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Total Control.</span>
          </h1>
          <p style={{ margin: '16px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.48)', lineHeight: 1.65, fontFamily: "'DM Sans',sans-serif", maxWidth: 340 }}>
            Manage budgets, track expenses, govern your financial operations — and get AI-powered insights across every business unit.
          </p>
        </div>

        {/* Mock dashboard */}
        <div style={{ marginBottom: 18 }}>
          <DashboardMock />
        </div>

        {/* Activity card */}
        <div style={{ marginBottom: 'auto' }}>
          <ActivityCard />
        </div>

        {/* Feature bullets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 32 }}>
          {[
            { icon: '⚡', text: 'Real-time tracking across all expense heads & tasks' },
            { icon: '🔐', text: 'Role-based access for Finance, Admin & Requestors' },
            { icon: '📊', text: 'AI insights, procurement analytics & audit trails' },
          ].map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13 }}>{f.icon}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', fontFamily: "'DM Sans',sans-serif", lineHeight: 1.4 }}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── main export ── */
export default function Login() {
  const [tab,     setTab]     = useState(0);
  const [email,   setEmail]   = useState('');
  const [pw,      setPw]      = useState('');
  const [name,    setName]    = useState('');
  const [showPw,  setShowPw]  = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 0) await login(email, pw);
      else await register({ email, password: pw, name, role: 'Requestor' });
      navigate('/');
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const IS = {
    width: '100%', padding: '11px 14px', fontSize: 13,
    fontFamily: "'DM Sans',sans-serif", border: '1.5px solid #E2E8F0',
    borderRadius: 9, background: '#F8FAFF', color: '#0F172A',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <LeftPanel />

      {/* Right — form panel */}
      <div className="l-right" style={{ flex: '0 0 44%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '40px 36px', overflowY: 'auto', position: 'relative' }}>

        {/* Subtle top-right decoration */}
        <div style={{ position: 'absolute', top: 0, right: 0, width: 220, height: 220, background: 'radial-gradient(circle at top right,rgba(79,110,247,0.06) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 180, height: 180, background: 'radial-gradient(circle at bottom left,rgba(139,92,246,0.05) 0%,transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', maxWidth: 350, position: 'relative', zIndex: 1 }}>

          {/* Mobile logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36 }}>
            <AppLogo size={30} />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1A2035', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Budget Intelligence</span>
          </div>

          {/* Heading */}
          <div className="lup">
            <h2 style={{ margin: '0 0 4px', fontSize: 23, fontWeight: 800, color: '#0F172A', fontFamily: "'Plus Jakarta Sans',sans-serif", letterSpacing: '-0.02em' }}>
              {tab === 0 ? 'Welcome back 👋' : 'Create account'}
            </h2>
            <p style={{ margin: '0 0 26px', fontSize: 13, color: '#64748B', fontFamily: "'DM Sans',sans-serif" }}>
              {tab === 0 ? 'Sign in to your workspace to continue.' : 'Start managing your budgets today.'}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="lup l1" style={{ display: 'flex', gap: 3, padding: 4, background: '#F1F5F9', borderRadius: 11, marginBottom: 26 }}>
            {['Sign In', 'Register'].map((t, i) => (
              <button key={i} className="ltab-btn"
                onClick={() => { setTab(i); setError(''); }}
                style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                  background: tab === i ? '#fff' : 'transparent',
                  color: tab === i ? '#1A2035' : '#64748B',
                  boxShadow: tab === i ? '0 1px 6px rgba(0,0,0,0.08)' : 'none',
                }}>
                {t}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {tab === 1 && (
              <div className="lup l1" style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: "'DM Sans',sans-serif" }}>Full Name</label>
                <input className="lin" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" required style={IS} />
              </div>
            )}

            <div className="lup l2" style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: "'DM Sans',sans-serif" }}>Email Address</label>
              <input className="lin" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required style={IS} />
            </div>

            <div className="lup l3" style={{ marginBottom: 6 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: "'DM Sans',sans-serif" }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input className="lin" type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" required style={{ ...IS, paddingRight: 42 }} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#4F6EF7'}
                  onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}>
                  {showPw ? <EyeOff /> : <EyeOn />}
                </button>
              </div>
            </div>

            {/* Spacer */}
            <div style={{ height: 14 }} />

            {tab === 1 && (
              <div className="lup l3" style={{ padding: '9px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>ℹ️</span>
                <span style={{ fontSize: 12, color: '#1E40AF', fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5 }}>New accounts start as <strong>Requestor</strong>. An Admin can update your role after sign-up.</span>
              </div>
            )}

            {error && (
              <div className="lup" style={{ padding: '9px 12px', background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 9, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>⚠️</span>
                <span style={{ fontSize: 12, color: '#BE123C', fontFamily: "'DM Sans',sans-serif" }}>{error}</span>
              </div>
            )}

            <div className="lup l4">
              <button type="submit" disabled={loading} className="lsubmit"
                style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                  cursor: loading ? 'default' : 'pointer',
                  background: loading ? '#E2E8F0' : 'linear-gradient(135deg,#4F6EF7 0%,#7C3AED 100%)',
                  color: loading ? '#94A3B8' : '#fff',
                  fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(79,110,247,0.38)',
                  letterSpacing: '0.01em',
                }}>
                {loading
                  ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <span style={{ width: 14, height: 14, border: '2px solid #CBD5E1', borderTopColor: '#4F6EF7', borderRadius: '50%', display: 'inline-block', animation: 'lSpin 0.7s linear infinite' }} />
                      Please wait…
                    </span>
                  : tab === 0 ? 'Sign In  →' : 'Create Account  →'
                }
              </button>
            </div>
          </form>

          {/* Footer */}
          <p className="lup l5" style={{ textAlign: 'center', marginTop: 28, fontSize: 11, color: '#CBD5E1', fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6 }}>
            Protected by enterprise-grade security.<br />
            <span style={{ color: '#4F6EF7' }}>Budget Intelligence</span> © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
