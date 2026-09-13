import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import { App } from './ui/App';
import { UpdatePrompt } from './ui/components/UpdatePrompt';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App extras={<UpdatePrompt />} />
  </StrictMode>,
);
