// Vercel serverless entry for the Express API.
//
// All `/api/*` requests are routed here (see vercel.json). We import the
// COMPILED backend (backend/dist) rather than the TS source so Vercel's
// bundler resolves the ESM `.js` import graph and firebase-admin without
// any TypeScript/extension friction.
//
// Credentials come from Vercel environment variables (FIREBASE_SERVICE_ACCOUNT,
// GUPSHUP_*, LSQ_*, …) — there is no .env file in the deployment.
import { buildApp } from "../backend/dist/app.js";

const app = buildApp();

export default app;
