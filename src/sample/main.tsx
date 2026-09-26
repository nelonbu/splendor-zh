import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';
import { loadSampleFixture } from './sampleFixture';
import { copy } from '../i18n/zhCN';

loadSampleFixture();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="sample-banner">{copy.sampleBanner}</div>
    <App />
  </StrictMode>,
);
