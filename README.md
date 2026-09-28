# Training Tracker

A fitness tracker web app, hosted on **Cloudflare Workers** (static assets + a small API).

## Project layout

```
public/            ← the app itself (served free from Cloudflare's edge)
  index.html
  css/app.css
  js/config.js     ← settings: app version, sync on/off
  js/store.js      ← all device storage goes through here
  js/core.js       ← data model, change tracking, maths
  js/sync.js       ← sync client for the future backend (off for now)
  js/views.js      ← screens
  js/app.js        ← navigation, gestures, actions
  sw.js            ← offline support
  _headers         ← response headers (no-cache so updates show immediately)
src/index.js       ← the Worker: handles /api/* only (the backend lives here)
migrations/        ← draft database schema for later (not used yet)
wrangler.jsonc     ← Cloudflare config
```

## Deploying an update

Edit files → commit to GitHub → Cloudflare rebuilds automatically (about a minute).
Your logged data is **not** in these files. It stays on your phone as long as the web address doesn't change.

When you release a noticeable change, bump `appVersion` in `public/js/config.js`
and the cache name `C` in `public/sw.js`. The app keeps a copy of your data from
before each version change (Settings → Restore data from before last update).

## Run locally (optional)

```
npm install
npx wrangler dev
```
Then open http://localhost:8787

## Backend plan (not built yet)

1. **Database**: `npx wrangler d1 create trainingtracker`, paste the id into `wrangler.jsonc`
   (commented block), then `npx wrangler d1 migrations apply trainingtracker --remote`.
2. **Accounts**: add sign-in (e.g. email magic link, or Cloudflare Access while it's just you).
3. **Sync endpoint**: implement `POST /api/sync` in `src/index.js` using the contract
   at the top of `public/js/sync.js`: store incoming records by `updated_at`, return
   everything changed since the client's `since`.
4. **Switch on**: set `syncEnabled: true` in `public/js/config.js`.

The app is already prepared for this: every record has an id and `updatedAt`,
deletions are kept as tombstones, each device has an id, and `Sync.merge()`
(newest edit wins, deletions win over older edits) is written and tested.
Once sync is on, your data no longer depends on one phone or one web address.
