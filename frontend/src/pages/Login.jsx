import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, TextField, Typography, Tabs, Tab } from '@mui/material';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [tab, setTab] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('Requestor');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 0) await login(email, password);
      else await register({ email, password, name, role });
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.100', p: 2 }}>
      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent>
          <Typography variant="h5" gutterBottom align="center">Budget Governance</Typography>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="Login" />
            <Tab label="Register" />
          </Tabs>
          <form onSubmit={handleSubmit}>
            {tab === 1 && (
              <>
                <TextField fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} margin="normal" required />
                <TextField fullWidth select SelectProps={{ native: true }} label="Role" value={role} onChange={(e) => setRole(e.target.value)} margin="normal">
                  <option value="Admin">Admin</option>
                  <option value="Requestor">Requestor</option>
                  <option value="Approver">Approver</option>
                  <option value="Finance">Finance</option>
                </TextField>
              </>
            )}
            <TextField fullWidth type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} margin="normal" required />
            <TextField fullWidth type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} margin="normal" required />
            {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}
            <Button type="submit" fullWidth variant="contained" sx={{ mt: 2 }} disabled={loading}>
              {tab === 0 ? 'Login' : 'Register'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
