import { getDb } from "./firebase.js";

/**
 * Initialise the Firestore connection. Firestore has no persistent socket like
 * MongoDB, so this just forces the Admin SDK to initialise and verifies that
 * credentials are present. Safe to call on every request (singleton inside).
 */
export async function connectDb(): Promise<void> {
  getDb();
}

/** No-op for Firestore — kept for parity with the old MongoDB API. */
export async function disconnectDb(): Promise<void> {
  // Firestore Admin SDK manages its own gRPC channels; nothing to close.
}
