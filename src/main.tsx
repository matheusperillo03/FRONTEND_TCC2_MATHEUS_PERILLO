import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SessaoProvider } from './sessao/SessaoContext';
import '@govbr-ds/core/dist/core.min.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessaoProvider>
      <App />
    </SessaoProvider>
  </StrictMode>,
);
