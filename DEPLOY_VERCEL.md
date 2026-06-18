# Deploying to Vercel (Firestore + Express)

The app deploys as a **single Vercel project**:

- **Frontend** — the Vite PWA, built to `frontend/dist` and served as static assets.
- **Backend** — the Express API, bundled as one serverless function at `api/index.js`
  (it imports the compiled backend from `backend/dist`). All `/api/*` requests are
  routed to it by [`vercel.json`](./vercel.json).
- **Database** — Cloud Firestore, accessed server-side via the Firebase Admin SDK.
- **Auth** — Firebase Google sign-in (client-side, unchanged).

No secret ever lives in the repo. You set them all as Vercel Environment Variables.

---

## 1. Firebase setup (one time)

1. In the [Firebase console](https://console.firebase.google.com/), open the
   `il-btl-lead-collection` project.
2. **Firestore** → *Create database* (production mode, region e.g. `asia-south1`).
3. **Authentication** → enable **Google** provider, and under *Settings →
   Authorized domains* add your Vercel domain (e.g. `ilbtl.vercel.app`).
4. **Project settings → Service accounts → Generate new private key.** This
   downloads a JSON file — keep it private (it is gitignored as
   `serviceAccountKey.json`).

### (Optional) Firestore TTL for OTP sessions
OTP sessions store an `expires_at` timestamp and are also checked in code, but you
can let Firestore auto-purge them: **Firestore → TTL → Create policy** on
collection `leadOtpSessions`, field `expires_at`.

---

## 2. Import the repo into Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import
   `isaee-xyz/ilbtl` from GitHub.
2. Leave the build settings as detected — `vercel.json` already defines the
   install command, build command (`npm run build`), output directory
   (`frontend/dist`), and the `/api` routing. **Do not override them.**

---

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

Add these for the **Production** (and Preview) environments:

### Backend (server-side secrets)
| Name | Value |
|------|-------|
| `FIREBASE_SERVICE_ACCOUNT` | Paste the **entire** service-account JSON as one value |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | `https://<your-domain>` (only needed if API is cross-origin) |
| `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE`, `GUPSHUP_APP_NAME`, `GUPSHUP_TEMPLATE_ID` | from Gupshup |
| `GUPSHUP_OTP_*`, `GUPSHUP_SMS_*`, `GUPSHUP_WEBHOOK_SECRET` | from Gupshup |
| `LSQ_ENABLED`, `LSQ_ACCESS_KEY`, `LSQ_SECRET_KEY`, `LSQ_API_HOST`, `LSQ_API_PATH` | from LeadSquared |

> `FIREBASE_SERVICE_ACCOUNT` must be the full JSON. The `\n` inside `private_key`
> can stay escaped — the app un-escapes it.

### Frontend (Firebase Web config — public, but still set here)
| Name | Value |
|------|-------|
| `VITE_FIREBASE_API_KEY` | from Firebase web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `il-btl-lead-collection.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `il-btl-lead-collection` |
| `VITE_FIREBASE_APP_ID` | from Firebase web app config |
| `VITE_API_URL` | leave **empty** (same-origin `/api`) |

---

## 4. Deploy & verify

1. Click **Deploy**.
2. Health check: `https://<your-domain>/api/health` → `{ "ok": true, "db": "connected" }`.
3. Open the app, sign in with Google, add a lead.

---

## Notes

- **First deploy seeds nothing.** Firestore starts empty; users are created on
  first login, leads on first capture.
- **Gupshup webhook URL:** `https://<your-domain>/api/webhooks/gupshup?secret=<GUPSHUP_WEBHOOK_SECRET>`.
- The `backend/lambda/` and `docker-compose.yml` paths are **legacy** (AWS/Docker
  + MongoDB) and are not used by the Vercel deployment.
- Local dev still uses a root `.env` (copy from `.env.example`) and
  `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT`.
