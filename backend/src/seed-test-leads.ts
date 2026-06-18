import "./config/env.js";
import { randomUUID } from "crypto";
import { connectDb } from "./config/database.js";
import { getDb } from "./config/firebase.js";
import { firstOf, leadsCol, usersCol, type LeadDoc } from "./models/index.js";
import { syncUserMilestones } from "./services/lead.service.js";

const COUNT = Number.parseInt(process.argv[2] ?? "100", 10);
const VERIFIED = process.argv.includes("--verified");
const DEMO_UID = "demo-volunteer-001";

async function main() {
  if (!Number.isFinite(COUNT) || COUNT < 1 || COUNT > 1000) {
    console.error("Usage: tsx src/seed-test-leads.ts [count] [--verified]");
    process.exit(1);
  }

  await connectDb();

  let user = await firstOf(usersCol().where("firebase_uid", "==", DEMO_UID));
  if (!user) {
    const all = await usersCol().get();
    user =
      all.docs
        .map((d) => d.data())
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0] ??
      null;
  }
  if (!user) {
    console.error("No users in database. Log in with Demo mode first, then re-run.");
    process.exit(1);
  }

  const allLeads = (await leadsCol().get()).docs.map((d) => d.data());
  const existingPhones = new Set(allLeads.map((l) => l.student_phone));

  const now = new Date();
  const leads: LeadDoc[] = [];
  let added = 0;

  for (let i = 1; added < COUNT; i++) {
    const phone = `98${String(10000000 + i).padStart(8, "0")}`;
    if (existingPhones.has(phone)) continue;

    existingPhones.add(phone);
    leads.push({
      id: randomUUID(),
      volunteer_id: user.id,
      volunteer_name: user.full_name,
      volunteer_email: user.email,
      student_name: `Test Student ${added + 1}`,
      student_phone: phone,
      status: VERIFIED ? "verified" : "unverified",
      verified_at: VERIFIED ? new Date(now.getTime() - added * 60_000) : null,
      whatsapp_replied_at: null,
      whatsapp_reply_text: null,
      runner_location: null,
      interested_in_courses: true,
      neet_marks: null,
      created_at: new Date(now.getTime() - added * 60_000),
    });
    added++;
  }

  if (leads.length > 0) {
    // Firestore batches cap at 500 writes — chunk to stay under the limit.
    for (let i = 0; i < leads.length; i += 400) {
      const batch = getDb().batch();
      for (const lead of leads.slice(i, i + 400)) {
        batch.set(leadsCol().doc(lead.id), lead);
      }
      await batch.commit();
    }
  } else {
    console.log("No new leads to add (phones already exist).");
  }

  let milestonesCreated = 0;
  if (VERIFIED) {
    milestonesCreated = await syncUserMilestones(user.id);
  }

  const volunteerLeads = (
    await leadsCol().where("volunteer_id", "==", user.id).get()
  ).docs.map((d) => d.data());
  const total = volunteerLeads.length;
  const verified = volunteerLeads.filter((l) => l.status === "verified").length;

  if (leads.length > 0) {
    console.log(
      `Added ${leads.length} ${VERIFIED ? "verified " : ""}leads for ${user.full_name} (${user.email}).`,
    );
  }
  console.log(`Totals: ${total} leads, ${verified} verified.`);
  if (milestonesCreated > 0) {
    console.log(`Created ${milestonesCreated} milestone reward(s).`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
