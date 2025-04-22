// File: src/index.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// 1) Grab your root container
const container = document.getElementById('root');

// 2) Create a root
const root = createRoot(container);

// 3) Render your app
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
