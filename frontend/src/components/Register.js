import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,Button,TextField,Typography,Paper,MenuItem,InputAdornment,IconButton,Alert,Divider,LinearProgress,List,ListItem,ListItemText,Grid,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

function Register({ user }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [teamId, setTeamId]       = useState('');
  const [role, setRole]           = useState('employee');
  const [teams, setTeams]         = useState([]);
  const [error, setError]         = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  // Import state
  const [impBusy, setImpBusy] = useState(false);
  const [impFile, setImpFile] = useState(null);
  const [impError, setImpError] = useState('');
  const [impResult, setImpResult] = useState(null);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const token = localStorage.getItem('token');
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
        const response = await axios.get('/api/teams', config);
        setTeams(response.data);
      } catch (err) {
        console.error('Error fetching teams:', err);
        setError('Could not fetch teams. Register an Admin first or create teams later.');
      }
    };
    fetchTeams();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    try {
      const payload = {
        firstName,
        lastName,
        email,
        password,
        teamId: teamId === '' ? null : parseInt(teamId),
        role,
      };

      const response = await axios.post('/api/register', payload);
      setSuccessMessage(response.data.message + ' You can now log in.');
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setTeamId('');
      setRole('employee');

      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    }
  };

  // Import handlers
  const onChooseImportFile = (e) => {
    setImpFile(e.target.files?.[0] || null);
    setImpError('');
    setImpResult(null);
  };

  const handleImport = async () => {
    setImpError('');
    setImpResult(null);
    if (!impFile) {
      setImpError('Please choose a .xlsx or .csv file.');
      return;
    }

    try {
      setImpBusy(true);
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('file', impFile);

      const res = await axios.post('/api/employees/import', form, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      setImpResult(res.data);
    } catch (err) {
      console.error('Import error:', err);
      setImpError(err.response?.data?.message || 'Failed to import employees.');
    } finally {
      setImpBusy(false);
    }
  };

  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', mt: 6 }}>
      <Grid container spacing={3}>
        {/* Left: Register form */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 4, borderRadius: 3 }}>
            <Typography variant="h5" gutterBottom>
              Register New User
            </Typography>
            <form onSubmit={handleSubmit}>
              <TextField
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                fullWidth
                required
                sx={{ mb: 2 }}
              />

              <TextField
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                fullWidth
                required
                sx={{ mb: 2 }}
              />

              <TextField
                label="Username (Email)"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                required
                sx={{ mb: 2 }}
              />

              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                sx={{ mb: 2 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword((prev) => !prev)} edge="end">
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                label="Team"
                select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                fullWidth
                required
                sx={{ mb: 2 }}
              >
                <MenuItem value="">-- Select Team --</MenuItem>
                {teams.map((team) => (
                  <MenuItem key={team.team_id} value={team.team_id}>
                    {team.team_name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Role"
                select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
              >
                <MenuItem value="employee">Employee</MenuItem>
                <MenuItem value="team_lead">Team Lead</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </TextField>
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}

              <Button type="submit" variant="contained" fullWidth>
                Register
              </Button>
            </form>
          </Paper>
        </Grid>

        {/* Right: Import employees (Admin only) */}
        {isAdmin && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 4, borderRadius: 3 }}>
              <Typography variant="h6" gutterBottom>
                Import Employees from Excel/CSV
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Expected columns (case-insensitive): <b>First Name</b>, <b>Last Name</b>, <b>Email</b>, <b>Password</b>.
                Optional: <b>Role</b> (admin | team_lead | employee) and either <b>Team Name</b> or <b>Team ID</b>.
                <br />Password is <b>required</b> for new employees; for existing employees, leave it blank to keep their current password.
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={onChooseImportFile}
                disabled={impBusy}
              />
              <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                <Button variant="contained" onClick={handleImport} disabled={impBusy || !impFile}>
                  Upload & Import
                </Button>
                {impBusy && <Box sx={{ flex: 1 }}><LinearProgress /></Box>}
              </Box>
              {impError && <Alert severity="error" sx={{ mt: 2 }}>{impError}</Alert>}
              {impResult && (
                <Box sx={{ mt: 3 }}>
                  <Alert severity="success">{impResult.message}</Alert>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle1">Summary</Typography>
                    <List dense>
                      <ListItem><ListItemText primary={`Inserted: ${impResult.summary?.inserted ?? 0}`} /></ListItem>
                      <ListItem><ListItemText primary={`Updated: ${impResult.summary?.updated ?? 0}`} /></ListItem>
                      <ListItem><ListItemText primary={`Skipped: ${impResult.summary?.skipped ?? 0}`} /></ListItem>
                    </List>
                    {impResult.summary?.errors?.length ? (
                      <>
                        <Typography variant="subtitle2" sx={{ mt: 1 }}>Row Errors</Typography>
                        <List dense sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid #eee' }}>
                          {impResult.summary.errors.map((e, idx) => (
                            <ListItem key={idx}>
                              <ListItemText primary={`Row ${e.row}: ${e.reason}`} />
                            </ListItem>
                          ))}
                        </List>
                      </>
                    ) : null}
                  </Box>
                </Box>
              )}
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
export default Register;
