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

// MUI
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
} from '@mui/material';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import TodayIcon from '@mui/icons-material/Today';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GroupIcon from '@mui/icons-material/Group';
import WorkIcon from '@mui/icons-material/Work';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';

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

// ---------------- Navbar ----------------
const Navbar = ({ user, onLogout }) => {
  const isAdmin = user.role === 'admin';
  const isTeamLead = user.role === 'team_lead';
  const location = useLocation();

  const linkStyle = ({ isActive }) => ({
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: 10,
    padding: '6px 12px',
    ...(isActive
      ? { backgroundColor: 'rgba(255,255,255,0.18)' }
      : { backgroundColor: 'transparent' }),
  });
  <Button
  component={NavLink}
  to="/dashboard"
  color="inherit"             // <-- inherits white from AppBar
  sx={linkStyle}
  startIcon={<DashboardIcon />}
/>
  return (
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
        {/* Brand (hamburger removed) */}
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={user.email || ''}>
            <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
              Hello, {user.first_name}
            </Typography>
          </Tooltip>
          <Button
            color="inherit"
            onClick={onLogout}
            startIcon={<LogoutIcon />}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 10 }}
          >
            Logout
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
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
    MuiButton: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiAppBar: {
      defaultProps: { elevation: 3 },
    },
    MuiContainer: {
      defaultProps: { maxWidth: 'xl' },
    },
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

export default AppShell;
