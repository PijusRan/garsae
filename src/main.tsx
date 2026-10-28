import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPwa } from './ui/pwa';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import './styles.css';

initPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
