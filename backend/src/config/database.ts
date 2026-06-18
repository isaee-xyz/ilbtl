import dns from "dns";
import mongoose from "mongoose";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const MONGODB_URI = process.env.MONGODB_URI;
let legacyIndexesSynced = false;

/** Remove obsolete indexes/fields that break multi-user signup (e.g. scout_roll). */
async function migrateLegacyUserIndexes(): Promise<void> {
  if (legacyIndexesSynced) return;
  const db = mongoose.connection.db;
  if (!db) return;

  const users = db.collection("users");

  for (const indexName of ["scout_roll_1", "scout_roll"]) {
    try {
      await users.dropIndex(indexName);
      console.log(`Dropped legacy users index: ${indexName}`);
    } catch {
      // Index absent — expected on fresh databases.
    }
  }

  // scout_ref must be sparse+unique (multiple users without a scout ref).
  try {
    await users.dropIndex("scout_ref_1");
    console.log("Dropped users index scout_ref_1 for sparse rebuild");
  } catch {
    // Index absent or already correct.
  }

  await users.createIndex(
    { scout_ref: 1 },
    { unique: true, sparse: true, name: "scout_ref_1" },
  );

  await users.updateMany(
    { $or: [{ scout_ref: null }, { scout_ref: "" }] },
    { $unset: { scout_roll: "", scout_ref: "" } },
  );

  legacyIndexesSynced = true;
}

export async function connectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    if (!MONGODB_URI) {
      throw new Error(
        "MONGODB_URI is not set. Add your MongoDB Atlas connection string to .env",
      );
    }

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
    });

    console.log(`MongoDB connected: ${mongoose.connection.db?.databaseName}`);
  }

  await migrateLegacyUserIndexes();
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
