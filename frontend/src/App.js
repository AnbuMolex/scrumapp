// App.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  useNavigate,
  useLocation,
  Navigate,
} from 'react-router-dom';
import axios from 'axios';
import { ModalProvider, useModal } from './context/ModalContext';
import Modal from './components/Modal';
import Login from './components/Login';
import Register from './components/Register';
import DailyEntry from './components/DailyEntry';
import ManageProjects from './components/ManageProjects';
import TeamManagement from './components/TeamManagement';
import TeamScrumReport from './components/TeamScrumReport';
import AdminSettings from './components/AdminSettings';
import Dashboard from './components/Dashboard';

// ---------------- MUI ----------------
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  Stack,
  Tooltip,
  Alert,
  CircularProgress,
  Divider,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  InputAdornment,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';

// ---------------- Icons ----------------
import DashboardIcon from '@mui/icons-material/Dashboard';
import TodayIcon from '@mui/icons-material/Today';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GroupIcon from '@mui/icons-material/Group';
import WorkIcon from '@mui/icons-material/Work';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import LockResetIcon from '@mui/icons-material/LockReset';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

// ---------------- Small helpers ----------------
const decodeJWT = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    return {
      employee_id: payload.employeeId,
      role: payload.role,
      team_id: payload.teamId,
      first_name: payload.firstName,
      email: payload.email,
    };
  } catch {
    return null;
  }
};

// ---------------- Error Boundary ----------------
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container sx={{ py: 8 }}>
          <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
              Something went wrong
            </Typography>
            <Typography variant="body2">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </Typography>
          </Alert>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </Container>
      );
    }
    return this.props.children;
  }
}

// ---------------- Axios Base URL ----------------
axios.defaults.baseURL = 'http://localhost:5000/';
const savedToken = localStorage.getItem('token');
if (savedToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

// ---------------- Change Password Dialog ----------------
const ChangePasswordDialog = ({ open, onClose, onSuccess }) => {
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const { showModal } = useModal();

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setShowCurrent(false);
    setShowNew(false);
  };

  const handleSubmit = async () => {
    if (!currentPassword.trim()) {
      showModal('Please enter your current password.');
      return;
    }
    if (!newPassword.trim() || newPassword.length < 8) {
      showModal('New password must be at least 8 characters.');
      return;
    }
    try {
      setSubmitting(true);
      // Adjust the endpoint to your backend route if different
      await axios.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });
      showModal('Password changed successfully. Please log in again.');
      reset();
      onClose();
      onSuccess?.(); // e.g., force logout
    } catch (e) {
      // Global interceptor will surface message if present; fallback here:
      if (!e.response?.data?.message) showModal('Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} maxWidth="xs" fullWidth>
      <DialogTitle>Change password</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Current password"
            type={showCurrent ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            fullWidth
            autoFocus
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowCurrent((v) => !v)} edge="end">
                    {showCurrent ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="New password"
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="Minimum 8 characters"
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowNew((v) => !v)} edge="end">
                    {showNew ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          {submitting ? 'Saving…' : 'Change password'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ---------------- Navbar ----------------
const Navbar = ({ user, onLogout }) => {
  const isAdmin = user.role === 'admin';
  const isTeamLead = user.role === 'team_lead';

  const [menuEl, setMenuEl] = React.useState(null);
  const [pwdOpen, setPwdOpen] = React.useState(false);

  const openMenu = (e) => setMenuEl(e.currentTarget);
  const closeMenu = () => setMenuEl(null);

  const linkStyle = ({ isActive }) => ({
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: 10,
    padding: '6px 12px',
    ...(isActive
      ? { backgroundColor: 'rgba(255,255,255,0.18)' }
      : { backgroundColor: 'transparent' }),
  });

  return (
    <>
      <AppBar
        position="sticky"
        elevation={3}
        sx={{
          background:
            'linear-gradient(90deg, rgba(30,136,229,0.95) 0%, rgba(123,31,162,0.95) 100%)',
          color: 'common.white',
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          {/* Brand */}
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 0.5, mr: 1 }}>
            GES SCRUM
          </Typography>

          <Divider
            orientation="vertical"
            flexItem
            sx={{ borderColor: 'rgba(255,255,255,0.25)', mr: 1 }}
          />

          <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
            <Button
              component={NavLink}
              to="/dashboard"
              color="inherit"
              sx={linkStyle}
              startIcon={<DashboardIcon />}
            >
              Dashboard
            </Button>

            <Button
              component={NavLink}
              to="/daily-entry"
              color="inherit"
              sx={linkStyle}
              startIcon={<TodayIcon />}
            >
              Daily Entry
            </Button>

            {(isAdmin || isTeamLead) && (
              <Button
                component={NavLink}
                to="/team-reports"
                color="inherit"
                sx={linkStyle}
                startIcon={<AssessmentIcon />}
              >
                Team Reports
              </Button>
            )}

            {isAdmin && (
              <>
                <Button
                  component={NavLink}
                  to="/admin-settings"
                  color="inherit"
                  sx={linkStyle}
                  startIcon={<SettingsIcon />}
                >
                  Settings
                </Button>
                <Button
                  component={NavLink}
                  to="/manage-teams"
                  color="inherit"
                  sx={linkStyle}
                  startIcon={<GroupIcon />}
                >
                  Manage Teams
                </Button>
                <Button
                  component={NavLink}
                  to="/manage-projects"
                  color="inherit"
                  sx={linkStyle}
                  startIcon={<WorkIcon />}
                >
                  Manage Projects
                </Button>
                <Button
                  component={NavLink}
                  to="/register"
                  color="inherit"
                  sx={linkStyle}
                  startIcon={<PersonAddAltIcon />}
                >
                  Register
                </Button>
              </>
            )}
          </Stack>

          {/* User menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title={user.email || ''}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
                  Hello, {user.first_name}
                </Typography>
                <IconButton
                  onClick={openMenu}
                  size="small"
                  sx={{ ml: 1, color: 'inherit' }}
                  aria-controls={menuEl ? 'user-menu' : undefined}
                  aria-haspopup="true"
                  aria-expanded={!!menuEl}
                >
                  <Avatar sx={{ width: 32, height: 32 }}>
                    <AccountCircleIcon />
                  </Avatar>
                </IconButton>
              </Stack>
            </Tooltip>

            <Menu
              id="user-menu"
              anchorEl={menuEl}
              open={!!menuEl}
              onClose={closeMenu}
              onClick={closeMenu}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem onClick={() => setPwdOpen(true)}>
                <ListItemIcon>
                  <LockResetIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Change password</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem onClick={onLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Logout</ListItemText>
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Password dialog */}
      <ChangePasswordDialog
        open={pwdOpen}
        onClose={() => setPwdOpen(false)}
        onSuccess={onLogout} // force re-login after password change
      />
    </>
  );
};

// ---------------- App ----------------
function App() {
  // Synchronous init to avoid crash on hard reload of protected routes
  const initialToken = localStorage.getItem('token');
  const initialUser = initialToken ? decodeJWT(initialToken) : null;

  const [token, setToken] = useState(initialToken);
  const [user, setUser] = useState(initialUser);
  const [booting, setBooting] = useState(false); // quick gate for rare edge cases

  const navigate = useNavigate();
  const location = useLocation();
  const { showModal } = useModal();

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    // Clear per-page cached states that your modules already use
    localStorage.removeItem('manageProjectsState');
    localStorage.removeItem('dailyEntryState');
    localStorage.removeItem('teamScrumReportState');

    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
    navigate('/login', { replace: true });
  }, [navigate]);

  const handleLogin = useCallback(
    (newToken, userData) => {
      localStorage.setItem('token', newToken);
      sessionStorage.setItem('lastPath', '/dashboard');
      setToken(newToken);
      setUser(userData);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      navigate('/dashboard', { replace: true });
    },
    [navigate]
  );

  // Finalize boot if token exists but user wasn't decodable at construction (very rare)
  useEffect(() => {
    if (token && !user) {
      setBooting(true);
      const u = decodeJWT(token);
      if (u) {
        setUser(u);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } else {
        handleLogout();
      }
      setBooting(false);
    }
  }, [token, user, handleLogout]);

  // Axios global error interceptor
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err.response?.status;
        const message = err.response?.data?.message;
        if (message && status !== 404) showModal(message);
        if (status === 401 || status === 403) handleLogout();
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [showModal, handleLogout]);

  // --- Memory of "tab" (last visited route) ---
  useEffect(() => {
    if (token) {
      // store last route (except /login)
      const p = location.pathname;
      if (p && p !== '/login') sessionStorage.setItem('lastPath', p);
    }
  }, [location.pathname, token]);

  // On load, if logged in and land on "/" or "/login", take user to last tab they used
  useEffect(() => {
    if (!token) return;
    if (location.pathname === '/' || location.pathname === '/login') {
      const last = sessionStorage.getItem('lastPath') || '/dashboard';
      navigate(last, { replace: true });
    }
  }, [location.pathname, token, navigate]);

  const isAdmin = user?.role === 'admin';
  const isTeamLead = user?.role === 'team_lead';

  if (booting) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      {user && <Navbar user={user} onLogout={handleLogout} />}
      <Container
        maxWidth="xl"
        sx={{
          py: 3,
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        <Modal />
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route
            path="/"
            element={token ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />}
          />

          {/* Protect routes: if token exists but user hasn't hydrated yet, pause render */}
          <Route
            path="/dashboard"
            element={
              token ? (
                user ? <Dashboard user={user} /> : <Box sx={{ p: 6 }}><CircularProgress /></Box>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          <Route
            path="/daily-entry"
            element={
              token ? (
                user ? <DailyEntry user={user} /> : <Box sx={{ p: 6 }}><CircularProgress /></Box>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {(isAdmin || isTeamLead) && (
            <Route
              path="/team-reports"
              element={
                token ? (
                  user ? (
                    <TeamScrumReport user={user} />
                  ) : (
                    <Box sx={{ p: 6 }}>
                      <CircularProgress />
                    </Box>
                  )
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
          )}

          {isAdmin && (
            <>
              <Route
                path="/register"
                element={
                  token ? (
                    user ? (
                      <Register user={user} />
                    ) : (
                      <Box sx={{ p: 6 }}>
                        <CircularProgress />
                      </Box>
                    )
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/manage-teams"
                element={
                  token ? (
                    user ? (
                      <TeamManagement user={user} />
                    ) : (
                      <Box sx={{ p: 6 }}>
                        <CircularProgress />
                      </Box>
                    )
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/manage-projects"
                element={
                  token ? (
                    user ? (
                      <ManageProjects user={user} />
                    ) : (
                      <Box sx={{ p: 6 }}>
                        <CircularProgress />
                      </Box>
                    )
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              <Route
                path="/admin-settings"
                element={
                  token ? (
                    user ? (
                      <AdminSettings user={user} />
                    ) : (
                      <Box sx={{ p: 6 }}>
                        <CircularProgress />
                      </Box>
                    )
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
            </>
          )}

          <Route path="*" element={<Typography variant="h6">404: Page Not Found</Typography>} />
        </Routes>
      </Container>
    </>
  );
}

// ---------------- Theme + Router Wrapper ----------------
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1e88e5' },
    background: { default: '#f7f9fc' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: ['Inter', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'].join(','),
    button: { fontWeight: 700 },
  },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiAppBar: { defaultProps: { elevation: 3 } },
    MuiContainer: { defaultProps: { maxWidth: 'xl' } },
  },
});

const AppShell = () => (
  <Router>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ModalProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ModalProvider>
    </ThemeProvider>
  </Router>
);

//const requestLogger = require('./middleware/requestLogger');
//app.use(requestLogger);

export default AppShell;
