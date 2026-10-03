import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { loadRuntimeConfig } from './runtimeConfig.js'

loadRuntimeConfig().finally(async () => {
  const { default: App } = await import('./App.jsx');

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
