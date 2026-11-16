import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { listenForInstall } from './lib/install';
import { AppProvider } from './lib/session';
import './styles.css';
import './components/doc.css';

listenForInstall(); // before React starts, so Chrome/Edge's install offer isn't missed

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
