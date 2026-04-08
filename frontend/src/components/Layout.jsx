import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Box, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Toolbar, Typography, Divider,
} from '@mui/material';
import MenuIcon           from '@mui/icons-material/Menu';
import DashboardIcon      from '@mui/icons-material/Dashboard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import GavelIcon          from '@mui/icons-material/Gavel';
import ReceiptIcon        from '@mui/icons-material/Receipt';
import ReceiptLongIcon    from '@mui/icons-material/ReceiptLong';
import StorefrontIcon     from '@mui/icons-material/Storefront';
import LogoutIcon         from '@mui/icons-material/Logout';
import { useAuth } from '../context/AuthContext';

const nav = [
  { path: '/',            label: 'Dashboard',   icon: <DashboardIcon/>      },
  { path: '/budgets',     label: 'Budgets',     icon: <AccountBalanceIcon/> },
  { path: '/nfa-tracker', label: 'NFA Tracker', icon: <GavelIcon/>          },
  { path: '/po',          label: 'PO',          icon: <ReceiptLongIcon/>    },
  { path: '/invoices',    label: 'Invoices',    icon: <ReceiptIcon/>        },
  { path: '/vendors',     label: 'Vendors',     icon: <StorefrontIcon/>     },
];
// Payments removed from nav — route still in App.jsx if needed

const BAR_H = 56;

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', background: '#F5F7FA' }}>

      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: t => t.zIndex.drawer + 1,
          background: 'linear-gradient(90deg,#0f172a 0%,#1e2d50 60%,#1a3856 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          color: '#fff',
        }}
      >
        <Toolbar sx={{ minHeight: `${BAR_H}px !important`, px: 2 }}>
          <IconButton onClick={() => setOpen(true)} edge="start" sx={{ mr: 2, color: 'rgba(255,255,255,0.7)' }}>
            <MenuIcon />
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1 }}>
            {/* App icon */}
            <Box sx={{
              width: 28, height: 28, borderRadius: '8px',
              background: 'linear-gradient(135deg,#4F6EF7,#8B5CF6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,255,255,0.9)' }} />
            </Box>

            <Typography sx={{
              fontFamily: "'Plus Jakarta Sans',sans-serif",
              fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em', color: '#fff',
            }}>
              Budget Intelligence<span style={{ color: '#818CF8' }}>.</span>
            </Typography>

            <Box sx={{ width: '1px', height: 16, background: 'rgba(255,255,255,0.18)', mx: 0.5 }} />

            {/* NACL logo — with text fallback */}
            <Box sx={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: '7px', px: 1, py: 0.4 }}>
              <img
                src="https://companieslogo.com/img/orig/NACLIND.NS_BIG.D-f03539c2.png?t=1730198651"
                alt="NACL Industries"
                style={{ height: 16, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }}
                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline'; }}
              />
              <span style={{ display: 'none', fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.85)', fontFamily: "'DM Sans',sans-serif", letterSpacing: '0.08em' }}>NACL</span>
            </Box>

            {/* Murugappa logo — with text fallback */}
            <Box sx={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.92)', borderRadius: '7px', px: 1, py: 0.4, height: 24 }}>
              <Box
                component="img"
                src="https://www.kindpng.com/picc/m/340-3403128_home-murugappa-group-logo-hd-png-download.png"
                alt="Murugappa Group"
                sx={{ height: 16, width: 'auto', objectFit: 'contain', display: 'block' }}
                onError={e => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <Box sx={{ display: 'none', alignItems: 'center', gap: 0.4 }}>
                <Typography sx={{ fontSize: 9, fontWeight: 800, color: '#1A2035', fontFamily: "'DM Sans',sans-serif", letterSpacing: '0.05em' }}>MURUGAPPA</Typography>
                <Typography sx={{ fontSize: 8, color: '#4A5578', fontFamily: "'DM Sans',sans-serif" }}>GROUP</Typography>
              </Box>
            </Box>
          </Box>

          {/* FY chip */}
          <Box sx={{ mr: 2, px: 1.5, py: 0.5, borderRadius: '20px', background: 'rgba(79,110,247,0.25)', border: '1px solid rgba(129,140,248,0.3)' }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#a5b4fc', fontFamily: "'DM Sans',sans-serif", letterSpacing: '0.06em' }}>
              FY 2026-27
            </Typography>
          </Box>

          {/* Avatar + name + role */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
            <Box sx={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'linear-gradient(135deg,#4F6EF7,#8B5CF6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#fff', fontFamily: "'DM Sans',sans-serif" }}>
                {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#fff', fontFamily: "'DM Sans',sans-serif", lineHeight: 1.2 }}>
                {user?.name || user?.email}
              </Typography>
              {user?.role && (
                <Typography sx={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.45)', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {user.role}
                </Typography>
              )}
            </Box>
          </Box>

          <IconButton onClick={() => { logout(); navigate('/login'); }} size="small" sx={{ color: 'rgba(255,255,255,0.45)', '&:hover': { color: '#F43F6E' } }}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* SIDE DRAWER */}
      <Drawer open={open} onClose={() => setOpen(false)}>
        <Toolbar sx={{ minHeight: `${BAR_H}px !important` }} />
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #E8ECF4', background: '#FAFBFF' }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#4F6EF7', letterSpacing: '0.1em', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase' }}>
            Navigation
          </Typography>
        </Box>
        <Box sx={{ width: 240, background: '#ffffff', height: '100%' }} onClick={() => setOpen(false)}>
          <List sx={{ pt: 1 }}>
            {nav.map(({ path, label, icon }) => {
              const isActive = path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(path);
              return (
                <ListItemButton
                  key={path}
                  selected={isActive}
                  onClick={() => navigate(path)}
                  sx={{
                    mx: 1, mb: 0.5, borderRadius: 2,
                    '&.Mui-selected': {
                      background: '#EEF2FF',
                      '& .MuiListItemIcon-root': { color: '#4F6EF7' },
                      '& .MuiListItemText-primary': { color: '#4F6EF7', fontWeight: 700 },
                    },
                    '&:hover': { background: '#F7F8FC' },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: isActive ? '#4F6EF7' : '#8C96B0' }}>
                    {icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={label}
                    primaryTypographyProps={{
                      fontSize: 13,
                      fontFamily: "'DM Sans',sans-serif",
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#4F6EF7' : '#4A5578',
                    }}
                  />
                  {isActive && <Box sx={{ width: 3, height: 20, borderRadius: 2, background: '#4F6EF7', ml: 1 }} />}
                </ListItemButton>
              );
            })}
          </List>
          <Divider sx={{ mx: 2, my: 1, borderColor: '#E8ECF4' }} />
          <Box sx={{ px: 2, py: 1 }}>
            <Typography sx={{ fontSize: 9, color: '#8C96B0', fontWeight: 700, letterSpacing: '0.1em', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase' }}>
              FY 2026-27
            </Typography>
          </Box>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          mt: `${BAR_H}px`,
          background: '#F5F7FA',
          minHeight: `calc(100vh - ${BAR_H}px)`,
          overflowX: 'hidden',
          overflowY: 'auto',
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}