# Training Tracker

A fitness tracker for individuals and personal trainers, hosted on **Cloudflare Workers**
(static app + API) with a **D1** database.

- Accounts: unique username + password (no email/phone). Data syncs across devices and works offline.
- Roles: **user** → **PT** (Coach tab: groups, client insights, edit client plans, coach notes) → **super admin** (`iby38`).
- Forgotten passwords go to the super admin, who sets a temporary password.

## First-time setup

1. **Create the database**: Cloudflare dashboard → Storage & Databases → D1 → Create.
   Name it `trainingtracker`. Copy the **Database ID**.
2. **Paste the ID** into `wrangler.jsonc`, replacing `PASTE-YOUR-DATABASE-ID-HERE`.
3. **Add the setup code**: Workers & Pages → `trainingtracker` → Settings → Variables and Secrets →
   Add → Type **Secret**, Name `SETUP_CODE`, Value: a long phrase only you know.
4. **Deploy**: commit the files to GitHub. Cloudflare builds automatically.
5. **Check**: open `https://<your-address>/api/health`. You want `"db":true` and `"adminSetup":true`.
6. **Create the admin account**: open the app → **App owner setup** → username `iby38`,
   a password, and the setup code. (The same screen recovers the admin password if you forget it.)

Database tables are created automatically on first use. No database commands needed.

## Day to day

- **Make someone a PT**: Coach tab → All users and roles → tap them → Make PT.
- **PT adds clients**: Coach tab → Add client (invite an existing username, or create an account
  with a temporary password). Create groups such as "Cohort 1" and add clients to them.
- **Edit a client's training**: tap the client → Open training. Edits and coach notes go straight
  to their account and they're notified. Tap **Done** in the green bar to return.
- **Password resets**: Coach tab → Password reset requests → Reset → tell them the temporary password.

## Updating

Edit or replace files in GitHub and commit; Cloudflare redeploys in about a minute.
Data is stored in the database and on each device, never in these files, so updates don't touch it.
For bigger releases, bump `appVersion` in `public/js/config.js` and the cache name `C` in `public/sw.js`.

## Project layout

```
public/            the app (HTML, CSS, JS, icons, offline support)
  js/config.js     version, sync interval
  js/store.js      device storage (one space per account)
  js/api.js        talks to the server
  js/core.js       data model, change tracking, maths
  js/insights.js   adherence, trends, plateaus, PRs, injury notes
  js/sync.js       device ⇄ server sync (newest edit wins)
  js/auth.js       sign-in screens and start-up
  js/views.js      screens
  js/app.js        navigation, gestures, actions, circuit timer
  js/coach.js      Coach tab and super admin tools
src/index.js       API routes (accounts, sync, coaching, groups, notifications, admin)
src/lib.js         password hashing, sessions, database schema
wrangler.jsonc     Cloudflare config (database binding, admin username)
```

## Run locally (optional)

```
npm install
echo "SETUP_CODE=pick-anything" > .dev.vars
npx wrangler dev
```
Open http://localhost:8787

## Notes

- Passwords use PBKDF2-SHA256 at 100,000 iterations (Cloudflare's maximum). On the Workers
  free plan a sign-in can exceed the 10 ms CPU allowance; occasional overage is tolerated and
  sessions last a year so sign-ins are rare. If sign-ins start failing, upgrade to Workers Paid.
- Notifications are in-app (bell icon), not phone push notifications.
- A coach needs a connection to edit a client's training; everyone's own logging works offline.
