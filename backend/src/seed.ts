import "./config/env.js";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { connectDb } from "./config/database.js";
import {
  firstOf,
  leadsCol,
  milestoneEventsCol,
  milestoneId,
  usersCol,
  walletItemsCol,
} from "./models/index.js";
import type { DbSchema } from "./types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, "..", "data", "db.json");

async function main() {
  await connectDb();

  const existingLeads = (await leadsCol().count().get()).data().count;
  if (existingLeads > 0) {
    console.log("Database already has data — skipping seed.");
    return;
  }

  let raw: string;
  try {
    raw = await readFile(JSON_PATH, "utf-8");
  } catch {
    console.log("No db.json found — starting with empty database.");
    return;
  }

  const data = JSON.parse(raw) as DbSchema;
  const seenPhones = new Set<string>();
  const usersById = Object.fromEntries(
    Object.values(data.users).map((user) => [user.id, user]),
  );

  for (const user of Object.values(data.users)) {
    const existing = await firstOf(
      usersCol().where("firebase_uid", "==", user.firebase_uid),
    );
    if (existing) continue;
    await usersCol().doc(user.id).set({
      id: user.id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      full_name: user.full_name,
      photo_url: user.photo_url ?? null,
      verified_lead_count: user.verified_lead_count,
      whatsapp_qr_url: null,
      whatsapp_qr_generated_at: null,
      scout_ref: null,
      last_login_location: null,
      last_login_at: null,
      created_at: new Date(user.created_at),
      updated_at: new Date(user.updated_at),
    });
  }

  for (const lead of data.leads) {
    if (seenPhones.has(lead.student_phone)) {
      console.log(`Skipping duplicate phone in seed: ${lead.student_phone}`);
      continue;
    }
    seenPhones.add(lead.student_phone);

    const volunteer = usersById[lead.volunteer_id];
    await leadsCol().doc(lead.id).set({
      id: lead.id,
      volunteer_id: lead.volunteer_id,
      volunteer_name: volunteer?.full_name ?? "Unknown",
      volunteer_email: volunteer?.email ?? "",
      student_name: lead.student_name,
      student_phone: lead.student_phone,
      status: lead.status,
      verified_at: lead.verified_at ? new Date(lead.verified_at) : null,
      whatsapp_replied_at: null,
      whatsapp_reply_text: null,
      runner_location: null,
      interested_in_courses: lead.interested_in_courses ?? true,
      neet_marks: lead.neet_marks ?? null,
      created_at: new Date(lead.created_at),
    });
  }

  for (const event of data.milestone_events) {
    const id = milestoneId(event.user_id, event.milestone_number);
    await milestoneEventsCol().doc(id).set({
      id,
      user_id: event.user_id,
      milestone_number: event.milestone_number,
      verified_count_at_trigger: event.verified_count_at_trigger,
      acknowledged: event.acknowledged,
      created_at: new Date(event.created_at),
    });
  }

  for (const item of data.wallet_items) {
    await walletItemsCol().doc(item.id).set({
      id: item.id,
      user_id: item.user_id,
      milestone_event_id: milestoneId(item.user_id, item.milestone_number),
      reward_type: item.reward_type,
      coupon_code: item.coupon_code,
      coupon_value: item.coupon_value,
      status: item.status,
      earned_at: new Date(item.earned_at),
      milestone_number: item.milestone_number,
    });
  }

  console.log(`Seeded ${Object.keys(data.users).length} users and ${seenPhones.size} leads.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
