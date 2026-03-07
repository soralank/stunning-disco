import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

// When deployed to GitHub Pages (https://soralank.github.io/stunning-disco),
// PUBLIC_URL = /stunning-disco — use it as the router base path.
const basename = process.env.PUBLIC_URL || '';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <BrowserRouter basename={basename}>
    <App />
  </BrowserRouter>
);