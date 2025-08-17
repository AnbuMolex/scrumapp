// frontend/src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 💠 NEW: Import MUI ThemeProvider and CssBaseline
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme'; // ✅ path to your theme.js file

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline /> {/* Applies global resets and background */}
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
