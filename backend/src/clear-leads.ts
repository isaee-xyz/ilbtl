import "./config/env.js";
import type { CollectionReference } from "firebase-admin/firestore";
import { connectDb } from "./config/database.js";
import { getDb } from "./config/firebase.js";
import {
  leadsCol,
  milestoneEventsCol,
  usersCol,
  walletItemsCol,
} from "./models/index.js";

/** Delete every document in a collection, in batches. Returns the count. */
async function deleteAll<T>(col: CollectionReference<T>): Promise<number> {
  const snap = await col.get();
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = getDb().batch();
    for (const doc of snap.docs.slice(i, i + 400)) {
      batch.delete(doc.ref);
      deleted++;
    }
    await batch.commit();
  }
  return deleted;
}

async function main() {
  await connectDb();

  const leadCount = await deleteAll(leadsCol());
  const milestoneCount = await deleteAll(milestoneEventsCol());
  const walletCount = await deleteAll(walletItemsCol());

  const now = new Date();
  const users = await usersCol().get();
  for (let i = 0; i < users.docs.length; i += 400) {
    const batch = getDb().batch();
    for (const doc of users.docs.slice(i, i + 400)) {
      batch.update(doc.ref, { verified_lead_count: 0, updated_at: now });
    }
    await batch.commit();
  }

  console.log(`Deleted ${leadCount} leads.`);
  console.log(`Deleted ${milestoneCount} milestone events.`);
  console.log(`Deleted ${walletCount} wallet items.`);
  console.log("Reset verified_lead_count for all users.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
