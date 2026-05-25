import { useState, useEffect } from 'react';
import {
  Box, Button, Card, CardContent, Typography, Table, TableHead, TableRow,
  TableCell, TableBody, Select, MenuItem, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, IconButton, Chip, CircularProgress, Alert,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

const tkn = () => localStorage.getItem('token') || '';
const hj  = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tkn()}` });
const authH = () => ({ Authorization: `Bearer ${tkn()}` });

const ROLES = ['Admin', 'Requestor', 'Approver', 'Finance'];
const DEPARTMENTS = ['IT', 'Finance', 'HR', 'B2C', 'Exports', 'B2B', 'Legal', 'R&D', 'Manufacturing', 'Registration & Regulatory', 'Technical Project'];

const ROLE_COLORS = {
  Admin:     { bg: '#EDE9FE', color: '#5B21B6' },
  Requestor: { bg: '#DBEAFE', color: '#1D4ED8' },
  Approver:  { bg: '#D1FAE5', color: '#065F46' },
  Finance:   { bg: '#FEF3C7', color: '#92400E' },
};

export default function Users() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [addOpen,  setAddOpen]  = useState(false);
  const [addForm,  setAddForm]  = useState({ name: '', email: '', password: '', role: 'Requestor', department: '' });
  const [addError, setAddError] = useState('');
  const [saving,   setSaving]   = useState(false);

  const [delTarget, setDelTarget] = useState(null);
  const [deleting,  setDeleting]  = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/auth/users', { headers: authH() });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to load users');
      setUsers(await r.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRoleChange = async (userId, newRole) => {
    try {
      const r = await fetch(`/api/auth/users/${userId}`, {
        method: 'PATCH', headers: hj(), body: JSON.stringify({ role: newRole }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (e) { setError(e.message); }
  };

  const handleDepartmentChange = async (userId, newDept) => {
    try {
      const r = await fetch(`/api/auth/users/${userId}`, {
        method: 'PATCH', headers: hj(), body: JSON.stringify({ department: newDept }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, department: newDept } : u));
    } catch (e) { setError(e.message); }
  };

  const handleAdd = async () => {
    setAddError('');
    setSaving(true);
    try {
      const r = await fetch('/api/auth/users', {
        method: 'POST',
        headers: hj(),
        body: JSON.stringify(addForm),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || d.errors?.[0]?.msg || 'Failed');
      setAddOpen(false);
      setAddForm({ name: '', email: '', password: '', role: 'Requestor', department: '' });
      await load();
    } catch (e) {
      setAddError(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/auth/users/${delTarget.id}`, { method: 'DELETE', headers: authH() });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setDelTarget(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setDeleting(false);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>User Management</Typography>
          <Typography variant="body2" color="text.secondary">Manage accounts and roles</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => { setAddForm({ name: '', email: '', password: '', role: 'Requestor', department: '' }); setAddError(''); setAddOpen(true); }}
          sx={{ background: '#4F46E5', '&:hover': { background: '#4338CA' } }}
        >
          Add User
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card elevation={0} sx={{ border: '1px solid #E2E8F0', borderRadius: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow sx={{ background: '#F8FAFC' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Joined</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(u => {
                const rc = ROLE_COLORS[u.role] || { bg: '#F1F5F9', color: '#475569' };
                return (
                  <TableRow key={u.id} hover>
                    <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>{u.name}</TableCell>
                    <TableCell sx={{ fontSize: 13, color: '#64748B' }}>{u.email}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        size="small"
                        renderValue={val => (
                          <Chip
                            label={val}
                            size="small"
                            sx={{ background: rc.bg, color: rc.color, fontWeight: 700, fontSize: 11, height: 22, cursor: 'pointer' }}
                          />
                        )}
                        sx={{ '& .MuiOutlinedInput-notchedOutline': { border: 'none' }, minWidth: 130 }}
                      >
                        {ROLES.map(r => <MenuItem key={r} value={r} sx={{ fontSize: 13 }}>{r}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.department || ''}
                        onChange={e => handleDepartmentChange(u.id, e.target.value)}
                        size="small"
                        displayEmpty
                        renderValue={val => val
                          ? <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1D23' }}>{val}</span>
                          : <span style={{ fontSize: 12, color: '#94A3B8' }}>— None —</span>
                        }
                        sx={{ '& .MuiOutlinedInput-notchedOutline': { border: 'none' }, minWidth: 160 }}
                      >
                        <MenuItem value="" sx={{ fontSize: 13, color: '#94A3B8' }}>— None —</MenuItem>
                        {DEPARTMENTS.map(d => <MenuItem key={d} value={d} sx={{ fontSize: 13 }}>{d}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: '#94A3B8' }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN') : '—'}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => setDelTarget(u)} sx={{ color: '#CBD5E1', '&:hover': { color: '#EF4444', background: '#FEF2F2' } }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!users.length && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5, color: '#94A3B8', fontSize: 13 }}>No users found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add User dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Add New User</DialogTitle>
        <DialogContent>
          {addError && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{addError}</Alert>}
          <TextField fullWidth label="Full Name" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} margin="normal" required autoFocus />
          <TextField fullWidth type="email" label="Email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} margin="normal" required />
          <TextField fullWidth type="password" label="Password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} margin="normal" required helperText="Minimum 6 characters" />
          <TextField
            fullWidth select label="Role" value={addForm.role}
            onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
            margin="normal"
            SelectProps={{ native: true }}
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </TextField>
          <TextField
            fullWidth select label="Department" value={addForm.department}
            onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))}
            margin="normal"
            SelectProps={{ native: true }}
          >
            <option value="">— None —</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)} sx={{ color: '#64748B' }}>Cancel</Button>
          <Button
            variant="contained" onClick={handleAdd} disabled={saving || !addForm.name || !addForm.email || !addForm.password}
            sx={{ background: '#4F46E5', '&:hover': { background: '#4338CA' } }}
          >
            {saving ? 'Creating…' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!delTarget} onClose={() => setDelTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Delete User?</DialogTitle>
        <DialogContent>
          <Typography fontSize={14}>
            Remove <strong>{delTarget?.name}</strong> ({delTarget?.email})? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDelTarget(null)} sx={{ color: '#64748B' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
