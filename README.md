# Infinity Runner

Mobile-first web app (PWA) for **Infinity Learn volunteers** to collect student leads at exam centers, track verified vs. unverified leads, and earn wallet rewards (e.g., Amazon coupons) at every **100 verified leads**.

## Documentation

| Document | Description |
|----------|-------------|
| [backend/docs/PRD.md](./backend/docs/PRD.md) | Product requirements, user stories, open questions |
| [backend/docs/TECH_DOC.md](./backend/docs/TECH_DOC.md) | Architecture, data model, APIs, security |
| [backend/docs/DESIGN_DOC.md](./backend/docs/DESIGN_DOC.md) | UX flows, screens, components, wireframes |
| [backend/docs/brand-tokens.md](./backend/docs/brand-tokens.md) | IL brand colors, typography, CSS variables |
| [backend/docs/DEPLOY.md](./backend/docs/DEPLOY.md) | **Production deployment (Docker)** |
| [backend/docs/DOCKER.md](./backend/docs/DOCKER.md) | Docker quick reference |
| [backend/lambda/DEVOPS.md](./backend/lambda/DEVOPS.md) | DevOps runbook — Gupshup webhook Lambda |

## Quick start (development)

```bash
npm run install:all
cp .env.example .env
npm run dev
```

- **App:** http://localhost:5173  
- **API:** http://localhost:3001  
- **Env:** single `.env` at project root  

Click **Continue in Demo Mode** on login to skip Google sign-in. The backend
still needs Firestore credentials — set `FIREBASE_SERVICE_ACCOUNT` (or
`GOOGLE_APPLICATION_CREDENTIALS`) in `.env`. See [.env.example](./.env.example).

## Project structure

```
frontend/        # React PWA (Vite)
backend/         # Express API (MVC) — Firestore via firebase-admin
api/index.js     # Vercel serverless entry (wraps the Express app)
vercel.json      # Vercel build + routing config
backend/lambda/  # AWS Lambda — Gupshup webhook (legacy)
.env             # secrets (gitignored) — copy from .env.example
docker-compose.yml  # legacy Docker path
```

## Production deploy — Vercel + Firestore

The app deploys as a single Vercel project: the Vite frontend as static assets,
the Express API as a serverless function under `/api`, and **Cloud Firestore** as
the database. All secrets are set as Vercel environment variables — nothing
sensitive is committed.

Full guide: **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)**.

**WhatsApp webhook (Gupshup callback):** `https://<domain>/api/webhooks/gupshup?secret=<GUPSHUP_WEBHOOK_SECRET>`

## Summary

- **Auth:** Firebase Google sign-in
- **Hosting:** Vercel (static frontend + serverless Express API)
- **Database:** Cloud Firestore (Firebase Admin SDK)
- **Lead capture:** Student name + phone; verified / unverified status
- **Rewards:** Wallet entry at each 100 verified leads milestone
- **Legacy paths:** Docker (`docker-compose.yml`) and AWS Lambda (`backend/lambda/`) — not used by the Vercel deploy
