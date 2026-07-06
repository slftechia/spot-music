import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadYouTubeAPI } from './hooks/usePlayer';
import './index.css';

loadYouTubeAPI();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
