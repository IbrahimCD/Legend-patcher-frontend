// FILE: src/App.js

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  createTheme,
  ThemeProvider,
  CssBaseline,
  Box,
  Typography
} from '@mui/material';
import Patcher from './components/Patcher';
import LinePatcher from './components/LinePatcher';

// Git‑Inspired Dark Theme
const gitTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#F05032' },
    background: { default: '#0D1117', paper: '#161B22' },
    error: { main: '#f85149' },
    success: { main: '#2ea44f' }
  },
  typography: {
    fontFamily: [
      'SFMono-Regular',
      'Consolas',
      'Liberation Mono',
      'Menlo',
      'Courier',
      'monospace'
    ].join(','),
    body1: { color: '#C9D1D9' },
    body2: { color: '#C9D1D9' },
    allVariants: { color: '#C9D1D9' }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { margin: 0, padding: 0 },
        html: { margin: 0, padding: 0 }
      }
    }
  }
});

export default function App() {
  return (
    <ThemeProvider theme={gitTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Box
          sx={{
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            bgcolor: 'background.default',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <Box sx={{ p: 2 }}>
            <Typography variant="h4" sx={{ fontWeight: 600 }}>
              Legend‑Driven Patcher
            </Typography>
          </Box>

          {/* Main Content */}
          <Box sx={{ flex: 1, display: 'flex' }}>
            <Routes>
              <Route path="/" element={<Patcher />} />
              <Route path="/line-based-patcher" element={<LinePatcher />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Box>
        </Box>
      </BrowserRouter>
    </ThemeProvider>
  );
}
