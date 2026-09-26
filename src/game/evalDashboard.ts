import dashboardHtml from '../../evals/dashboard.html?raw';
import type { SingleGameReport } from './evalTypes';

/**
 * Opens the eval dashboard in a new browser tab with the report data pre-loaded.
 * Uses Vite's ?raw import to inline the dashboard HTML and injects the data
 * via a script tag that sets window.__EVAL_DATA__ before the dashboard JS runs.
 */
export function openEvalDashboard(report: SingleGameReport): void {
  const dataScript = `<script>window.__EVAL_DATA__ = ${JSON.stringify(report)};<\/script>`;
  // Inject the data script right before the closing </head> so it runs before body scripts
  const html = dashboardHtml.replace('</head>', dataScript + '\n</head>');
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Revoke after a short delay to allow the tab to load
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
