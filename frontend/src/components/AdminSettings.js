import React, { useState } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  Paper,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';

function AdminSettings({ user }) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleFactoryReset = async () => {
    const confirmed = window.confirm(
      '⚠️ Are you sure you want to factory reset?\nThis will delete all teams, projects, reports, and users except the default admin.'
    );
    if (!confirmed) return;

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete('/api/factory-reset', {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSuccessMessage(response.data.message || '✅ Factory reset complete. Database cleared!');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      console.error('Factory reset error:', err);
      setErrorMessage(err.response?.data?.message || '❌ Factory reset failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <Box sx={{ mt: 4 }}>
        <Alert severity="error">Access Denied. Admins only.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', mt: 6 }}>
      <Typography variant="h4" gutterBottom>
        Admin Settings
      </Typography>
      <Typography variant="body1" sx={{ mb: 4 }}>
        This panel allows you to perform critical administrative operations.
      </Typography>

      <Paper elevation={3} sx={{ p: 4, borderRadius: 3 }}>
        <Typography variant="h6" gutterBottom>
          Factory Reset
        </Typography>
        <Typography variant="body2" sx={{ mb: 3 }}>
          Clear all data in the application (teams, projects, reports, users) except the default admin.
        </Typography>

        {errorMessage && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage}</Alert>}
        {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}

        <Button
          variant="contained"
          color="error"
          onClick={handleFactoryReset}
          disabled={loading}
          startIcon={loading && <CircularProgress size={20} />}
        >
          {loading ? 'Resetting...' : '🔥 Factory Reset'}
        </Button>
      </Paper>
    </Box>
  );
}

export default AdminSettings;
