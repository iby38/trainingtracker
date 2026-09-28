/**
 * Training Tracker Worker.
 * Static files in /public are served directly by Cloudflare (free, never reaches this code).
 * Only requests to /api/* run here — this is where the backend will live.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check — the app's Settings page uses this to show "Server: Online".
    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'trainingtracker', time: Date.now() });
    }

    // Placeholder for the future sync endpoint (see public/js/sync.js for the contract).
    if (url.pathname === '/api/sync') {
      return json({ error: 'Sync is not set up yet' }, 501);
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);

    // Anything else: hand back to the static files.
    return env.ASSETS.fetch(request);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
