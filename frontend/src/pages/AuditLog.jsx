/**
 * pages/AuditLog.jsx  — FY 2026-27
 * Full audit log viewer with filters: module, action, user, date range
 * Admin-only page
 */
import { useState, useEffect } from 'react';
import {
  Box, Card, Table, TableHead, TableRow, TableCell, TableBody,
  Typography, CircularProgress, TextField, FormControl, InputLabel,
  Select, MenuItem, Chip, Button, Tooltip, IconButton,
} from '@mui/material';
import RefreshIcon  from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import { api }      from '../api/client';
import { useAuth }  from '../context/AuthContext';

const FY      = 'FY 2026–27';
const MODULES = ['Budget','NFA','Invoice','Payment','Approvals','PO','Vendor'];
const ACTIONS = ['Create','Edit','Delete','File Upload','Submit for Approval','Approved','Rejected','NFA Raised','NFA Approved','Status Change'];

const ACTION_COLOR = {
  'Create':              { bg:'#D1FAE5', color:'#065F46' },
  'Edit':                { bg:'#DBEAFE', color:'#1E40AF' },
  'Delete':              { bg:'#FEE2E2', color:'#991B1B' },
  'File Upload':         { bg:'#EDE9FE', color:'#5B21B6' },
  'Approved':            { bg:'#D1FAE5', color:'#065F46' },
  'Rejected':            { bg:'#FEE2E2', color:'#991B1B' },
  'NFA Raised':          { bg:'#FEF3C7', color:'#92400E' },
  'Submit for Approval': { bg:'#DBEAFE', color:'#1E40AF' },
  'NFA Approved':        { bg:'#D1FAE5', color:'#065F46' },
};

function ActionChip({ action }) {
  const style = ACTION_COLOR[action] || { bg:'#F1F5F9', color:'#475569' };
  return (
    <Chip label={action} size="small" sx={{
      fontWeight:700, fontSize:11, height:22,
      bgcolor:style.bg, color:style.color,
      '& .MuiChip-label':{px:1},
    }}/>
  );
}

function ModuleChip({ mod }) {
  return (
    <Chip label={mod} size="small" variant="outlined" sx={{
      fontWeight:600, fontSize:11, height:22,
      '& .MuiChip-label':{px:1},
    }}/>
  );
}

function DiffView({ oldVal, newVal }) {
  if (!oldVal && !newVal) return null;
  const old = oldVal ? JSON.parse(oldVal) : {};
  const nw  = newVal ? JSON.parse(newVal) : {};
  const keys = [...new Set([...Object.keys(old), ...Object.keys(nw)])].filter(k => {
    const ignoredKeys = ['id','createdAt','updatedAt','_fromNFA'];
    return !ignoredKeys.includes(k) && JSON.stringify(old[k]) !== JSON.stringify(nw[k]);
  });
  if (!keys.length) return <Typography variant="caption" color="text.disabled">No changes</Typography>;
  return (
    <Box>
      {keys.slice(0,4).map(k=>(
        <Box key={k} display="flex" gap={1} mb={0.3} alignItems="baseline">
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{minWidth:80,flexShrink:0}}>
            {k}:
          </Typography>
          {old[k]!==undefined && (
            <Typography variant="caption" sx={{textDecoration:'line-through',color:'#EF4444',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {String(old[k]).slice(0,30)}
            </Typography>
          )}
          {nw[k]!==undefined && (
            <Typography variant="caption" sx={{color:'#10B981',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              → {String(nw[k]).slice(0,30)}
            </Typography>
          )}
        </Box>
      ))}
      {keys.length>4&&<Typography variant="caption" color="text.secondary">+{keys.length-4} more changes</Typography>}
    </Box>
  );
}

export default function AuditLog() {
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filterMod,setFilterMod]= useState('');
  const [filterAct,setFilterAct]= useState('');
  const [filterUsr,setFilterUsr]= useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const { user } = useAuth();
  const isAdmin  = user?.role === 'Admin';

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.audit.list({
        ...(filterMod  ? { module:filterMod }  : {}),
        ...(filterAct  ? { action:filterAct }  : {}),
        ...(filterUsr  ? { user:filterUsr }    : {}),
        ...(dateFrom   ? { from:dateFrom }     : {}),
        ...(dateTo     ? { to:dateTo }         : {}),
      });
      setLogs(Array.isArray(data) ? data : []);
    } catch { setLogs([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleExport = () => {
    const rows = [
      ['Timestamp','User','Module','Action','Record ID','Changes'],
      ...logs.map(l => [
        l.timestamp,
        l.user,
        l.module,
        l.action,
        l.recordId || '',
        l.newValue ? JSON.parse(l.newValue) : '',
      ]),
    ];
    const csv   = rows.map(r=>r.map(v=>JSON.stringify(v)).join(',')).join('\n');
    const blob  = new Blob([csv],{type:'text/csv'});
    const a     = document.createElement('a');
    a.href      = URL.createObjectURL(blob);
    a.download  = `AuditLog_${FY.replace(/\s/g,'_')}.csv`;
    a.click();
  };

  if (!isAdmin) {
    return (
      <Box p={4}>
        <Typography color="error">Access denied — Admin only.</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h5">Audit Log</Typography>
          <Typography variant="caption" color="text.secondary">{FY} · Every change is tracked</Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button startIcon={<DownloadIcon/>} variant="outlined" onClick={handleExport} disabled={!logs.length}>
            Export CSV
          </Button>
          <Tooltip title="Refresh">
            <IconButton onClick={load}><RefreshIcon/></IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Filters */}
      <Box display="flex" gap={1.5} mb={2} flexWrap="wrap" alignItems="center">
        <FormControl size="small" sx={{minWidth:130}}>
          <InputLabel>Module</InputLabel>
          <Select value={filterMod} label="Module" onChange={e=>setFilterMod(e.target.value)}>
            <MenuItem value="">All Modules</MenuItem>
            {MODULES.map(m=><MenuItem key={m} value={m}>{m}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{minWidth:150}}>
          <InputLabel>Action</InputLabel>
          <Select value={filterAct} label="Action" onChange={e=>setFilterAct(e.target.value)}>
            <MenuItem value="">All Actions</MenuItem>
            {ACTIONS.map(a=><MenuItem key={a} value={a}>{a}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" label="User" value={filterUsr}
          onChange={e=>setFilterUsr(e.target.value)} sx={{minWidth:140}}/>
        <TextField size="small" type="date" label="From" InputLabelProps={{shrink:true}}
          value={dateFrom} onChange={e=>setDateFrom(e.target.value)} sx={{minWidth:150}}/>
        <TextField size="small" type="date" label="To" InputLabelProps={{shrink:true}}
          value={dateTo} onChange={e=>setDateTo(e.target.value)} sx={{minWidth:150}}/>
        <Button variant="contained" onClick={load}>Apply</Button>
        <Button variant="outlined" onClick={()=>{ setFilterMod('');setFilterAct('');setFilterUsr('');setDateFrom('');setDateTo(''); setTimeout(load,50); }}>
          Clear
        </Button>
      </Box>

      <Card>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}><CircularProgress/></Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{bgcolor:'#F8FAFF'}}>
                <TableCell><b>Timestamp</b></TableCell>
                <TableCell><b>User</b></TableCell>
                <TableCell><b>Module</b></TableCell>
                <TableCell><b>Action</b></TableCell>
                <TableCell><b>Record ID</b></TableCell>
                <TableCell><b>Changes</b></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{color:'text.secondary',py:4}}>
                    No audit records found.
                  </TableCell>
                </TableRow>
              )}
              {logs.map((l,i)=>(
                <TableRow key={l.id||i} hover>
                  <TableCell sx={{whiteSpace:'nowrap'}}>
                    <Typography variant="caption" color="text.secondary">
                      {l.timestamp ? new Date(l.timestamp).toLocaleString('en-IN') : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{l.user||'—'}</Typography>
                  </TableCell>
                  <TableCell><ModuleChip mod={l.module||'—'}/></TableCell>
                  <TableCell><ActionChip action={l.action||'—'}/></TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary"
                      sx={{fontFamily:'monospace',fontSize:10}}>
                      {l.recordId ? l.recordId.slice(0,12)+'…' : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <DiffView oldVal={l.oldValue} newVal={l.newValue}/>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </Box>
  );
}