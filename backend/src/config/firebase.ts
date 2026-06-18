import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

let firestore: Firestore | null = null;

/**
 * Build the Admin SDK credential from the environment.
 *
 * Priority:
 *   1. FIREBASE_SERVICE_ACCOUNT — full service-account JSON as a single env var
 *      (recommended for Vercel; paste the downloaded JSON here).
 *   2. GOOGLE_APPLICATION_CREDENTIALS — path to a service-account file
 *      (handled implicitly by applicationDefault()).
 */
function initAdminApp(): void {
  if (getApps().length) return;

  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (inlineJson) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(inlineJson);
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON. Paste the full service-account JSON.",
      );
    }
    // \n in the private key may be escaped when stored in an env var — restore real newlines.
    if (typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    initializeApp({
      credential: cert(parsed as Parameters<typeof cert>[0]),
      projectId: (parsed.project_id as string) || process.env.FIREBASE_PROJECT_ID,
    });
    return;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault() });
    return;
  }

  throw new Error(
    "No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT (service-account JSON) " +
      "or GOOGLE_APPLICATION_CREDENTIALS (path to the key file).",
  );
}

/** Lazily initialise and return the Firestore instance (singleton). */
export function getDb(): Firestore {
  if (firestore) return firestore;
  initAdminApp();
  firestore = getFirestore();
  // Allow `undefined` fields to be dropped instead of throwing on write.
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
}

/** True once a Firestore handle exists — used by the health check. */
export function isDbInitialized(): boolean {
  return firestore !== null;
}

/** Firebase Auth (Admin) — used to verify client ID tokens. Ensures init first. */
export function getAuthClient(): Auth {
  getDb(); // guarantees initAdminApp() has run
  return getAuth();
}
