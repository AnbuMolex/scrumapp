// MUI theme extension and component styles (v5)
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  typography: {
    fontFamily: 'Arial, sans-serif',
  },
  palette: {
    mode: 'light',
    primary: {
      main: '#2076d1',
    },
    secondary: {
      main: '#e67e22',
    },
    error: {
      main: '#e74c3c',
    },
    success: {
      main: '#2ecc71',
    },
    background: {
      default: '#f0f2f5',
      paper: '#ffffff',
    },
    text: {
      primary: '#333',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*': {
          margin: 0,
          padding: 0,
          boxSizing: 'border-box',
        },
        body: {
          lineHeight: 1.6,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#2c3e50',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: 'none',
          fontWeight: 600,
          '&:hover': {
            opacity: 0.95,
          },
        },
        containedPrimary: {
          backgroundColor: '#2076d1',
          '&:hover': {
            backgroundColor: '#17457a',
          },
        },
        containedError: {
          backgroundColor: '#e74c3c',
          '&:hover': {
            backgroundColor: '#c0392b',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #e1e7ef',
        },
        indicator: {
          backgroundColor: '#2076d1',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          '&.Mui-selected': {
            color: '#2076d1',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: '16px',
        },
        elevation1: {
          boxShadow: '0 8px 36px rgba(34, 50, 90, 0.08), 0 1.5px 8px rgba(34, 50, 90, 0.06)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: '#fafdff',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: '#e6f1fa',
          fontWeight: 700,
          color: '#184066',
        },
        root: {
          borderBottom: '1px solid #e1e7ef',
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          backgroundColor: '#fcfdff',
          border: '1px solid #c8d3e1',
          borderRadius: 6,
          padding: '9px 12px',
          fontSize: '1rem',
        },
        input: {
          '&:focus': {
            borderColor: '#3498db',
            boxShadow: '0 0 8px rgba(52, 152, 219, 0.3)',
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
    MuiSelect: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
      styleOverrides: {
        outlined: {
          backgroundColor: '#fcfdff',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        standardError: {
          backgroundColor: '#fbeaea',
          color: '#d11e1e',
        },
        standardSuccess: {
          backgroundColor: '#e9faea',
          color: '#15723e',
        },
        standardWarning: {
          backgroundColor: '#fff8e1',
          color: '#ff6f00',
        },
      },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          fontSize: '0.95rem',
        },
      },
    },
  },
});

export default theme;

