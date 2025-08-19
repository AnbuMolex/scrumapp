import React, { useState } from 'react';
import axios from 'axios';
import '../index.css';

// MUI
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  Divider,
  TextField,
  Button,
  Typography,
  InputAdornment,
  Avatar,
  CircularProgress,
  Alert,
} from '@mui/material';

// Icons
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { data } = await axios.post('/api/login', { email, password });
      onLogin(data.token, data.employee);
    } catch (err) {
      console.error('Login error:', err);
      setError(err?.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        // Subtle gradient background
        background:
          'linear-gradient(135deg, rgba(25,118,210,0.12) 0%, rgba(156,39,176,0.10) 50%, rgba(0,0,0,0.06) 100%)',
      }}
    >
      <Card
        elevation={8}
        sx={{
          width: '100%',
          maxWidth: 440,
          borderRadius: 4,
          backdropFilter: 'blur(6px)',
        }}
      >
        <CardHeader
          avatar={
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              <LockOutlinedIcon />
            </Avatar>
          }
          title={
            <Typography variant="h5" fontWeight={700}>
              Welcome back
            </Typography>
          }
          subheader={<Typography variant="body2">Sign in to continue</Typography>}
          sx={{ pb: 0 }}
        />
        <CardContent sx={{ pt: 2 }}>
          <Divider sx={{ mb: 3 }} />
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <TextField
              label="Email"
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={isLoading}
              autoComplete="email"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonIcon />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              label="Password"
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={isLoading}
              autoComplete="current-password"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon />
                  </InputAdornment>
                ),
              }}
            />

            {error && (
              <Alert severity="error" variant="outlined">
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isLoading}
              sx={{ py: 1.2, borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
            >
              {isLoading ? (
                <>
                  <CircularProgress size={22} sx={{ mr: 1 }} />
                  Logging in…
                </>
              ) : (
                'Login'
              )}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Login;
