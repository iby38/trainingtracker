/* Training Tracker configuration.
   When the backend is built, flip syncEnabled to true. apiBase stays '' because
   the API is served from the same Cloudflare Worker as the app (/api/...). */
window.TRAININGTRACKER_CONFIG = {
  appVersion: '2.2',
  apiBase: '',
  syncEnabled: false
};
