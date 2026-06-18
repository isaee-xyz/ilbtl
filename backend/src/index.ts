import "./config/env.js";
import { buildApp } from "./app.js";
import { connectDb } from "./config/database.js";
import {
  backfillLeadVolunteerFields,
  backfillMilestones,
} from "./services/lead.service.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";
const app = buildApp();

connectDb()
  .then(async () => {
    await backfillLeadVolunteerFields();
    await backfillMilestones();
    app.listen(PORT, HOST, () => {
      console.log(`API server running on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialise Firestore:", err);
    process.exit(1);
  });
