import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
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
  IconButton,
  Container,
  Box,
  Stack,
  Tooltip,
  Alert
} from '@mui/material';

// Icons
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TodayIcon from '@mui/icons-material/Today';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GroupIcon from '@mui/icons-material/Group';
import WorkIcon from '@mui/icons-material/Work';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';

// ---------------- Error Boundary ----------------
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container sx={{ py: 6 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Something went wrong</Typography>
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

// ---------------- App ----------------
function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const { showModal } = useModal();

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('manageProjectsState');
    localStorage.removeItem('dailyEntryState');
    localStorage.removeItem('teamScrumReportState');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
    navigate('/login');
  }, [navigate]);

  const handleLogin = useCallback((newToken, userData) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    navigate('/dashboard');
  }, [navigate]);

  // Decode token on first load
  useEffect(() => {
    if (token && !user) {
      try {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        setUser({
          employee_id: decoded.employeeId,
          role: decoded.role,
          team_id: decoded.teamId,
          first_name: decoded.firstName,
          email: decoded.email,
        });
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error('Token decoding failed:', error);
        handleLogout();
      }
    }
  }, [token, user, handleLogout]);

  // Axios global error interceptor
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      res => res,
      err => {
        const status = err.response?.status;
        const message = err.response?.data?.message;
        if (message && status !== 404) showModal(message);
        if (status === 401 || status === 403) handleLogout();
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [showModal, handleLogout]);

  const isAdmin = user?.role === 'admin';
  const isTeamLead = user?.role === 'team_lead';

  return (
    <>
      {user && <Navbar user={user} onLogout={handleLogout} />}
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Modal />
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/" element={token ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />} />
          <Route path="/dashboard" element={token ? <Dashboard user={user} /> : <Navigate to="/login" replace />} />
          <Route path="/daily-entry" element={token ? <DailyEntry user={user} /> : <Navigate to="/login" replace />} />

          {isAdmin && (
            <>
              <Route path="/register" element={<Register user={user} />} />
              <Route path="/manage-teams" element={<TeamManagement user={user} />} />
              <Route path="/manage-projects" element={<ManageProjects user={user} />} />
              <Route path="/admin-settings" element={<AdminSettings user={user} />} />
            </>
          )}

          {(isAdmin || isTeamLead) && (
            <Route path="/team-reports" element={<TeamScrumReport user={user} />} />
          )}

          <Route path="*" element={<Typography variant="h6">404: Page Not Found</Typography>} />
        </Routes>
      </Container>
    </>
  );
}

// ---------------- Navbar ----------------
const Navbar = ({ user, onLogout }) => {
  const isAdmin = user.role === 'admin';
  const isTeamLead = user.role === 'team_lead';

  const navButtonProps = {
    color: 'inherit',
    sx: { textTransform: 'none', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }
  };

  return (
    <AppBar position="static" elevation={2}>
      <Toolbar>
        <IconButton edge="start" color="inherit" sx={{ mr: 1 }}>
          <MenuIcon />
        </IconButton>

        <Button
          component={Link}
          to="/dashboard"
          {...navButtonProps}
          startIcon={<DashboardIcon />}
          sx={{ ...navButtonProps.sx, mr: 2 }}
        >
          <Typography variant="h6" component="span">GES SCRUM</Typography>
        </Button>

        <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
          <Button component={Link} to="/daily-entry" {...navButtonProps} startIcon={<TodayIcon />}>
            Daily Entry
          </Button>

          {(isAdmin || isTeamLead) && (
            <Button component={Link} to="/team-reports" {...navButtonProps} startIcon={<AssessmentIcon />}>
              Team Reports
            </Button>
          )}

          {isAdmin && (
            <>
              <Button component={Link} to="/admin-settings" {...navButtonProps} startIcon={<SettingsIcon />}>
               Settings
              </Button>
              <Button component={Link} to="/manage-teams" {...navButtonProps} startIcon={<GroupIcon />}>
                Manage Teams
              </Button>
              <Button component={Link} to="/manage-projects" {...navButtonProps} startIcon={<WorkIcon />}>
                Manage Projects
              </Button>
              <Button component={Link} to="/register" {...navButtonProps} startIcon={<PersonAddAltIcon />}>
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
          <Button {...navButtonProps} onClick={onLogout} startIcon={<LogoutIcon />}>
            Logout
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

// ---------------- Theme + Router Wrapper ----------------
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1e88e5' },
  },
  shape: { borderRadius: 8 },
});

const AppWithRouter = () => (
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

export default AppWithRouter;
