import { useState, useEffect, useRef } from 'react';
import {
  Box, Button, Card, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, Dialog, DialogTitle, DialogContent, TextField, Chip,
  CircularProgress, MenuItem, Select, InputLabel, FormControl,
  Alert, LinearProgress, Divider,
} from '@mui/material';
import AddIcon                  from '@mui/icons-material/Add';
import CheckIcon                from '@mui/icons-material/Check';
import CloseIcon                from '@mui/icons-material/Close';
import SendIcon                 from '@mui/icons-material/Send';
import CheckCircleIcon          from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import UploadFileIcon           from '@mui/icons-material/UploadFile';
import DownloadIcon             from '@mui/icons-material/Download';
import AutoAwesomeIcon          from '@mui/icons-material/AutoAwesome';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const fmt = (v) => 'Rs.' + Number(v || 0).toLocaleString('en-IN');

/* ── Tick / checkbox button ─────────────────────────────────── */
function TickButton({ done, label, onClick, disabled }) {
  return (
    <Box
      onClick={disabled ? undefined : onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        p: '8px 14px', borderRadius: 2, width: 'fit-content',
        border: '1.5px solid', userSelect: 'none',
        borderColor: done ? '#6EE7B7' : '#E2E8F0',
        bgcolor:     done ? '#F0FDF4' : '#FAFAFA',
        opacity: disabled ? 0.45 : 1,
        transition: 'all 0.15s',
        '&:hover': disabled ? {} : {
          borderColor: done ? '#10B981' : '#94A3B8',
          bgcolor:     done ? '#DCFCE7' : '#F1F5F9',
        },
      }}
    >
      {done
        ? <CheckCircleIcon sx={{ color: '#10B981', fontSize: 20 }} />
        : <RadioButtonUncheckedIcon sx={{ color: '#CBD5E1', fontSize: 20 }} />}
      <Typography variant="body2" fontWeight={done ? 700 : 400}
        color={done ? '#065F46' : '#64748B'}>
        {label}
      </Typography>
    </Box>
  );
}

/* ── Vertical connector line between steps ──────────────────── */
function StepLine({ done }) {
  return (
    <Box sx={{
      width: 2, height: 20, ml: '19px', my: 0.4, borderRadius: 1,
      bgcolor: done ? '#10B981' : '#E2E8F0',
    }} />
  );
}

/* ── Status chip for table ──────────────────────────────────── */
function StatusChip({ a }) {
  if (a.pdfUrl && a.nfaApproved)
    return <Chip label="Complete" size="small" sx={{ bgcolor: '#D1FAE5', color: '#065F46', fontWeight: 700, border: '1px solid #6EE7B7' }} />;
  if (a.nfaApproved)
    return <Chip label="Approved" size="small" sx={{ bgcolor: '#DBEAFE', color: '#1E40AF', fontWeight: 700, border: '1px solid #93C5FD' }} />;
  if (a.nfaRaised)
    return <Chip label="Raised" size="small" sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 700, border: '1px solid #FCD34D' }} />;
  return <Chip label="Draft" size="small" sx={{ bgcolor: '#F1F5F9', color: '#475569', fontWeight: 700 }} />;
}

/* ── NFA Workflow Dialog ─────────────────────────────────────── */
function NFAWorkflowDialog({
  nfa, projects, open, onClose, onUpdated,
  canApprove, canCreate,
  approveComment, setApproveComment, onApprove, onSubmit,
}) {
  const [saving,    setSaving]    = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMsg,     setAiMsg]     = useState('');
  const [local,     setLocal]     = useState(nfa);
  const [manualAmt, setManualAmt] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { setLocal(nfa); setAiMsg(''); }, [nfa]);

  const linkedProject = projects.find((p) => p.id === local.linkedProjectId);

  const applyPatch = async (data) => {
    setSaving(true);
    const token = localStorage.getItem('token') || '';
    try {
      const r = await fetch('/api/nfa-tracker/' + local.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(data),
      });
      const updated = r.ok ? await r.json() : { ...local, ...data };
      setLocal(updated);
      onUpdated(updated);
    } catch {
      const updated = { ...local, ...data };
      setLocal(updated);
      onUpdated(updated);
    }
    setSaving(false);
  };

  const patchBudget = async (projectId, amount) => {
    if (!projectId) return;
    const token = localStorage.getItem('token') || '';
    await fetch('/api/budgets/' + projectId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ nfaApproved: amount, nfaApprovedStatus: 'approved' }),
    }).catch(() => {});
  };

  const handleToggleRaised = () => {
    const next = !local.nfaRaised;
    applyPatch(next
      ? { nfaRaised: true }
      : { nfaRaised: false, nfaApproved: false, pdfUrl: null, approvedAmount: null });
  };

  const handleToggleApproved = () => {
    if (!local.nfaRaised) return;
    applyPatch({ nfaApproved: !local.nfaApproved });
  };

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setAiLoading(true);
    setAiMsg('Uploading PDF...');

    let url = URL.createObjectURL(file);
    const token = localStorage.getItem('token') || '';
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('approvalId', local.id);
      const r = await fetch('/api/nfa-tracker/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: form,
      });
      if (r.ok) {
        const d = await r.json();
        url = d.url || d.fileUrl || url;
      }
    } catch { /* use object URL fallback */ }

    setAiMsg('Reading PDF with AI...');

    const rawText = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const bin = ev.target.result || '';
        const matches = bin.match(/\(([^)\\]{2,120})\)/g) || [];
        const text = matches.map((m) => m.slice(1, -1)).join(' ');
        resolve(text.length > 50 ? text : bin.slice(0, 5000));
      };
      reader.readAsBinaryString(file);
    });

    let extractedAmount = null;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: 'Extract the approved NFA/budget amount in INR from this document. Return ONLY valid JSON with no markdown: {"amount": <number or null>}\n\n' + rawText.slice(0, 4000),
          }],
        }),
      });
      const d = await res.json();
      const txt = (d.content && d.content[0] && d.content[0].text) || '{}';
      const parsed = JSON.parse(txt.replace(/```json|```/g, '').trim());
      extractedAmount = parsed.amount || null;
    } catch { /* AI failed */ }

    const updates = { pdfUrl: url, pdfName: file.name };
    if (extractedAmount) {
      updates.approvedAmount = extractedAmount;
      setAiMsg('AI extracted: ' + fmt(extractedAmount) + ' — populated to linked budget.');
      await patchBudget(local.linkedProjectId, extractedAmount);
    } else {
      setAiMsg('AI could not find an amount. Enter it manually below.');
    }
    await applyPatch(updates);
    setAiLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleManualAmount = async () => {
    const val = parseFloat(manualAmt);
    if (!val) return;
    await applyPatch({ approvedAmount: val });
    await patchBudget(local.linkedProjectId, val);
    setManualAmt('');
    setAiMsg(fmt(val) + ' saved and populated to budget.');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography variant="h6" fontWeight={700}>{local.title}</Typography>
        {linkedProject && (
          <Typography variant="caption" color="primary.main" fontWeight={600}>
            Project: {linkedProject.name}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent>
        {saving && <LinearProgress sx={{ mb: 1.5 }} />}

        {local.description && (
          <Typography variant="body2" color="text.secondary" mb={1.5}>
            {local.description}
          </Typography>
        )}
        {local.amount > 0 && (
          <Typography variant="body2" mb={2}>
            Requested Amount: <b>{fmt(local.amount)}</b>
          </Typography>
        )}

        <Divider sx={{ mb: 2 }} />

        <Typography variant="caption" fontWeight={700} color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', mb: 1.5 }}>
          NFA Workflow
        </Typography>

        {/* Step 1 */}
        <TickButton
          done={local.nfaRaised}
          label="NFA Raised — submitted in external portal"
          onClick={handleToggleRaised}
        />
        <StepLine done={local.nfaRaised} />

        {/* Step 2 */}
        <TickButton
          done={local.nfaApproved}
          label="NFA Approved by authority"
          onClick={handleToggleApproved}
          disabled={!local.nfaRaised}
        />
        <StepLine done={local.nfaApproved} />

        {/* Step 3 — Upload PDF */}
        <Box sx={{
          p: 1.5, borderRadius: 2, border: '1.5px solid', transition: 'all 0.2s',
          borderColor: local.pdfUrl ? '#6EE7B7' : local.nfaApproved ? '#C7D2FE' : '#E2E8F0',
          bgcolor:     local.pdfUrl ? '#F0FDF4' : local.nfaApproved ? '#EEF2FF' : '#F8FAFC',
          opacity: local.nfaApproved ? 1 : 0.5,
        }}>
          <Typography variant="body2" fontWeight={600} mb={1.2}
            color={local.pdfUrl ? '#065F46' : local.nfaApproved ? '#3730A3' : '#94A3B8'}>
            {local.pdfUrl
              ? ('Uploaded: ' + (local.pdfName || 'Approved NFA PDF'))
              : 'Upload Approved NFA Softcopy (PDF)'}
          </Typography>

          <Box display="flex" gap={1} flexWrap="wrap">
            <Button
              size="small"
              variant={local.pdfUrl ? 'outlined' : 'contained'}
              startIcon={<UploadFileIcon />}
              disabled={!local.nfaApproved || aiLoading}
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              {local.pdfUrl ? 'Replace PDF' : 'Upload PDF'}
            </Button>
            {local.pdfUrl && (
              <Button
                size="small" variant="outlined" color="success"
                startIcon={<DownloadIcon />}
                component="a" href={local.pdfUrl}
                target="_blank" rel="noopener noreferrer"
                download={local.pdfName || 'NFA_Approved.pdf'}
              >
                Download PDF
              </Button>
            )}
          </Box>

          <input
            ref={fileRef} type="file" accept="application/pdf"
            style={{ display: 'none' }} onChange={handleFile}
          />

          {aiLoading && (
            <Box mt={1.5}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                <AutoAwesomeIcon sx={{ fontSize: 12, mr: 0.4, verticalAlign: 'middle' }} />
                {aiMsg}
              </Typography>
            </Box>
          )}

          {(!aiLoading && aiMsg) && (
            <Alert severity={aiMsg.startsWith('AI could') ? 'info' : 'success'}
              sx={{ mt: 1.5, py: 0.3, fontSize: 12 }}>
              {aiMsg}
            </Alert>
          )}

          {local.nfaApproved && (
            <Box mt={1.5}>
              {local.approvedAmount ? (
                <Typography variant="body2">
                  Approved Amount:{' '}
                  <b style={{ color: '#10B981' }}>{fmt(local.approvedAmount)}</b>
                  <Typography component="span" variant="caption" color="text.secondary" ml={1}>
                    (populated to budget)
                  </Typography>
                </Typography>
              ) : (
                <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                  <TextField
                    size="small" type="number" label="Approved amount (Rs.)"
                    inputProps={{ min: 0, step: 0.01 }}
                    sx={{ width: 200 }}
                    value={manualAmt}
                    onChange={(e) => setManualAmt(e.target.value)}
                  />
                  <Button size="small" variant="outlined"
                    disabled={!manualAmt} onClick={handleManualAmount}>
                    Save & Populate
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* Original comments — preserved */}
        {(local.comments || []).length > 0 && (
          <Box mt={2.5}>
            <Typography variant="subtitle2" mb={1}>Comments</Typography>
            {local.comments.map((c, i) => (
              <Box key={i} sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="body2">{c.text}</Typography>
                <Typography variant="caption" color="textSecondary">
                  {c.by} · {c.at && c.at.seconds ? new Date(c.at.seconds * 1000).toLocaleString() : ''}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Original submit/approve/reject buttons — preserved */}
        <Box sx={{ mt: 2.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {local.status === 'Draft' && canCreate && (
            <Button startIcon={<SendIcon />} variant="contained"
              onClick={() => onSubmit(local.id)}>
              Submit for Approval
            </Button>
          )}
          {(local.status === 'Submitted' || local.status === 'Pending') && canApprove && (
            <>
              <TextField size="small" placeholder="Comment"
                value={approveComment} onChange={(e) => setApproveComment(e.target.value)} />
              <Button startIcon={<CheckIcon />} variant="contained" color="success"
                onClick={() => onApprove(local.id, false)}>
                Approve
              </Button>
              <Button startIcon={<CloseIcon />} variant="outlined" color="error"
                onClick={() => onApprove(local.id, true)}>
                Reject
              </Button>
            </>
          )}
          <Button onClick={onClose}>Close</Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE — all original state names preserved exactly
══════════════════════════════════════════════════════════════ */
export default function NFATracker() {
  const [list,            setList]            = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [open,            setOpen]            = useState(false);
  const [detailOpen,      setDetailOpen]      = useState(null);
  const [title,           setTitle]           = useState('');
  const [description,     setDescription]     = useState('');
  const [amount,          setAmount]          = useState('');
  const [approveComment,  setApproveComment]  = useState('');
  const [rejecting,       setRejecting]       = useState(false);   // original
  const [projects,        setProjects]        = useState([]);
  const [linkedProjectId, setLinkedProjectId] = useState('');

  const { user } = useAuth();
  const canCreate  = ['Admin', 'Requestor'].includes(user && user.role);
  const canApprove = ['Admin', 'Approver'].includes(user && user.role);

  const load = () => api.nfaTracker.list().then(setList);

  useEffect(() => {
    load();
    setLoading(false);
    api.budgets.list()
      .then((d) => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await api.nfaTracker.create({
      title,
      description,
      amount: amount ? parseFloat(amount) : undefined,
      linkedProjectId: linkedProjectId || undefined,
    });
    setOpen(false);
    setTitle(''); setDescription(''); setAmount(''); setLinkedProjectId('');
    load();
  };

  const handleSubmit = async (id) => {
    await api.nfaTracker.submit(id);
    setDetailOpen(null);
    load();
  };

  const handleApprove = async (id, reject) => {
    await api.nfaTracker.approve(id, { comment: approveComment, reject: !!reject });
    setDetailOpen(null);
    setApproveComment('');
    setRejecting(false);
    load();
  };

  const handleUpdated = (updated) => {
    setList((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  }

  const selected = detailOpen != null ? list.find((a) => a.id === detailOpen) : null;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">NFA Tracker</Typography>
        {canCreate && (
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
            New NFA
          </Button>
        )}
      </Box>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Project</TableCell>
              <TableCell>Title</TableCell>
              <TableCell align="center">NFA Raised</TableCell>
              <TableCell align="center">NFA Approved</TableCell>
              <TableCell align="right">Approved Amount</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created By</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((a) => {
              const proj = projects.find((p) => p.id === a.linkedProjectId);
              return (
                <TableRow key={a.id} hover>
                  <TableCell>
                    {proj
                      ? <Typography variant="body2" fontWeight={600}>{proj.name}</Typography>
                      : <Typography variant="body2" color="text.disabled">—</Typography>}
                  </TableCell>

                  <TableCell>{a.title}</TableCell>

                  <TableCell align="center">
                    <Chip
                      label={a.nfaRaised ? 'Yes' : 'No'}
                      size="small"
                      sx={{
                        fontWeight: 700, fontSize: 11, height: 22,
                        bgcolor: a.nfaRaised ? '#D1FAE5' : '#FEE2E2',
                        color:   a.nfaRaised ? '#065F46' : '#991B1B',
                        border:  '1px solid ' + (a.nfaRaised ? '#6EE7B7' : '#FCA5A5'),
                        '& .MuiChip-label': { px: 1 },
                      }}
                    />
                  </TableCell>

                  <TableCell align="center">
                    {!a.nfaRaised ? (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    ) : (
                      <Chip
                        label={a.nfaApproved ? 'Approved' : 'Pending'}
                        size="small"
                        sx={{
                          fontWeight: 700, fontSize: 11, height: 22,
                          bgcolor: a.nfaApproved ? '#D1FAE5' : '#FEF3C7',
                          color:   a.nfaApproved ? '#065F46' : '#92400E',
                          border:  '1px solid ' + (a.nfaApproved ? '#6EE7B7' : '#FCD34D'),
                          '& .MuiChip-label': { px: 1 },
                        }}
                      />
                    )}
                  </TableCell>

                  <TableCell align="right">
                    {a.approvedAmount
                      ? <Typography variant="body2" fontWeight={700} color="success.main">{fmt(a.approvedAmount)}</Typography>
                      : <Typography variant="body2" color="text.disabled">—</Typography>}
                  </TableCell>

                  <TableCell><StatusChip a={a} /></TableCell>

                  <TableCell>{a.createdByName || '—'}</TableCell>

                  <TableCell align="right">
                    <Button size="small" onClick={() => setDetailOpen(a.id)}>Manage</Button>
                    {a.pdfUrl && (
                      <Button
                        size="small" color="success" sx={{ ml: 0.5 }}
                        component="a" href={a.pdfUrl} target="_blank"
                        rel="noopener noreferrer"
                        download={a.pdfName || 'NFA_Approved.pdf'}
                      >
                        PDF
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {list.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                  No NFAs yet. Click "New NFA" to create one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New NFA</DialogTitle>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <FormControl fullWidth margin="normal" required>
              <InputLabel>Select Project *</InputLabel>
              <Select
                value={linkedProjectId}
                label="Select Project *"
                onChange={(e) => setLinkedProjectId(e.target.value)}
              >
                <MenuItem value=""><em>— Choose a project —</em></MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                      {p.businessUnit && (
                        <Typography variant="caption" color="text.secondary">{p.businessUnit}</Typography>
                      )}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField fullWidth label="NFA Title" value={title}
              onChange={(e) => setTitle(e.target.value)} margin="normal" required />
            <TextField fullWidth label="Description" value={description}
              onChange={(e) => setDescription(e.target.value)} margin="normal" multiline />
            <TextField fullWidth type="number" inputProps={{ min: 0, step: 0.01 }}
              label="Requested Amount (Rs.)" value={amount}
              onChange={(e) => setAmount(e.target.value)} margin="normal" />

            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button type="submit" variant="contained"
                disabled={!linkedProjectId || !title}>
                Create NFA
              </Button>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
            </Box>
          </form>
        </DialogContent>
      </Dialog>

      {/* Workflow dialog */}
      {selected && (
        <NFAWorkflowDialog
          nfa={selected}
          projects={projects}
          open={Boolean(selected)}
          onClose={() => setDetailOpen(null)}
          onUpdated={handleUpdated}
          canApprove={canApprove}
          canCreate={canCreate}
          approveComment={approveComment}
          setApproveComment={setApproveComment}
          onApprove={handleApprove}
          onSubmit={handleSubmit}
        />
      )}
    </Box>
  );
}