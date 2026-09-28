/* Liftlog configuration.
   When the backend is built, flip syncEnabled to true. apiBase stays '' because
   the API is served from the same Cloudflare Worker as the app (/api/...). */
window.LIFTLOG_CONFIG = {
  appVersion: '2.1',
  apiBase: '',
  syncEnabled: false
};
