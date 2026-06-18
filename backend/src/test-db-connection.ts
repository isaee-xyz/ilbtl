import "./config/env.js";
import { connectDb } from "./config/database.js";
import { usersCol } from "./models/index.js";

async function main() {
  await connectDb();
  // A trivial read proves credentials + project access are working.
  const count = (await usersCol().count().get()).data().count;
  console.log(`Firestore connection OK (users: ${count})`);
}

main().catch((error) => {
  console.error("Firestore connection failed:", error.message);
  process.exit(1);
});
