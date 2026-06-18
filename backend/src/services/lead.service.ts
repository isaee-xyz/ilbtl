import { randomUUID } from "crypto";
import { DuplicatePhoneError } from "../utils/errors.js";
import { getDb } from "../config/firebase.js";
import {
  getById,
  firstOf,
  leadsCol,
  usersCol,
  walletItemsCol,
  milestoneEventsCol,
  milestoneId,
  type LeadDoc,
  type UserDoc,
} from "../models/index.js";
import type {
  Lead,
  LeadSummary,
  MilestoneEvent,
  PendingMilestone,
  RunnerLeadStats,
  UserRecord,
  WalletItem,
  WhatsAppQrInfo,
} from "../types/index.js";
import { buildScoutRef, buildWhatsAppQrUrl } from "../utils/whatsapp-qr.js";
import { parseIndianMobile } from "../utils/validators.js";

export interface WhatsAppLeadVerifyResult {
  leadId: string;
  created: boolean;
  verified: boolean;
  alreadyVerified: boolean;
  milestone: MilestoneEvent | null;
}

function toUserRecord(user: UserDoc): UserRecord {
  return {
    id: user.id,
    firebase_uid: user.firebase_uid,
    email: user.email,
    full_name: user.full_name,
    photo_url: user.photo_url ?? null,
    verified_lead_count: user.verified_lead_count,
    whatsapp_qr_url: user.whatsapp_qr_url ?? null,
    whatsapp_qr_generated_at:
      user.whatsapp_qr_generated_at?.toISOString() ?? null,
    last_login_location: user.last_login_location ?? null,
    last_login_at: user.last_login_at?.toISOString() ?? null,
    created_at: user.created_at.toISOString(),
    updated_at: user.updated_at.toISOString(),
  };
}

export function toLead(lead: LeadDoc): Lead {
  return {
    id: lead.id,
    volunteer_id: lead.volunteer_id,
    volunteer_name: lead.volunteer_name ?? "",
    volunteer_email: lead.volunteer_email ?? "",
    student_name: lead.student_name,
    student_phone: lead.student_phone,
    status: lead.status as Lead["status"],
    verified_at: lead.verified_at?.toISOString() ?? null,
    runner_location: lead.runner_location ?? null,
    interested_in_courses: lead.interested_in_courses ?? true,
    neet_marks: lead.neet_marks ?? null,
    created_at: lead.created_at.toISOString(),
  };
}

/** All leads belonging to a volunteer, newest first. */
async function leadsForVolunteer(userId: string): Promise<LeadDoc[]> {
  const snap = await leadsCol().where("volunteer_id", "==", userId).get();
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

/** Lookup a lead globally by its (normalised) student phone. */
async function findLeadByPhone(student_phone: string): Promise<LeadDoc | null> {
  return firstOf(leadsCol().where("student_phone", "==", student_phone));
}

export async function backfillLeadVolunteerFields(): Promise<void> {
  const snap = await leadsCol().get();
  for (const doc of snap.docs) {
    const lead = doc.data();
    if (lead.volunteer_name && lead.volunteer_email) continue;
    const user = await getById(usersCol(), lead.volunteer_id);
    if (!user) continue;
    await leadsCol().doc(lead.id).update({
      volunteer_name: user.full_name,
      volunteer_email: user.email,
    });
  }
}

export async function getRunnerLeadStats(
  minLeads = 100,
): Promise<RunnerLeadStats[]> {
  const snap = await leadsCol().get();

  const byVolunteer = new Map<
    string,
    { name: string; email: string; total: number; verified: number }
  >();

  for (const doc of snap.docs) {
    const lead = doc.data();
    const entry = byVolunteer.get(lead.volunteer_id) ?? {
      name: lead.volunteer_name || "Unknown",
      email: lead.volunteer_email || "",
      total: 0,
      verified: 0,
    };
    entry.total += 1;
    if (lead.status === "verified") entry.verified += 1;
    byVolunteer.set(lead.volunteer_id, entry);
  }

  return [...byVolunteer.entries()]
    .filter(([, e]) => e.total >= minLeads)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([volunteer_id, e]) => ({
      volunteer_id,
      volunteer_name: e.name,
      volunteer_email: e.email,
      total_leads: e.total,
      verified_leads: e.verified,
      unverified_leads: e.total - e.verified,
    }));
}

export async function upsertUser(input: {
  firebase_uid: string;
  email: string;
  full_name: string;
  photo_url: string | null;
}): Promise<UserRecord> {
  const now = new Date();
  const existing = await firstOf(
    usersCol().where("firebase_uid", "==", input.firebase_uid),
  );

  if (existing) {
    await usersCol().doc(existing.id).update({
      email: input.email,
      full_name: input.full_name,
      photo_url: input.photo_url,
      updated_at: now,
    });
    return toUserRecord({
      ...existing,
      email: input.email,
      full_name: input.full_name,
      photo_url: input.photo_url,
      updated_at: now,
    });
  }

  const user: UserDoc = {
    id: randomUUID(),
    firebase_uid: input.firebase_uid,
    email: input.email,
    full_name: input.full_name,
    photo_url: input.photo_url,
    verified_lead_count: 0,
    whatsapp_qr_url: null,
    whatsapp_qr_generated_at: null,
    scout_ref: null,
    last_login_location: null,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  };
  await usersCol().doc(user.id).set(user);
  return toUserRecord(user);
}

export async function getUserByFirebaseUid(
  firebase_uid: string,
): Promise<UserRecord | null> {
  const user = await firstOf(usersCol().where("firebase_uid", "==", firebase_uid));
  return user ? toUserRecord(user) : null;
}

function toWhatsAppQrInfo(user: UserDoc): WhatsAppQrInfo {
  const hasQr =
    Boolean(user.whatsapp_qr_generated_at) ||
    Boolean(user.whatsapp_qr_url) ||
    Boolean(user.scout_ref);
  const url = hasQr ? buildWhatsAppQrUrl(user.full_name) : null;
  return {
    generated: Boolean(url),
    url,
    generated_at: user.whatsapp_qr_generated_at?.toISOString() ?? null,
  };
}

export async function getWhatsAppQrForUser(
  userId: string,
): Promise<WhatsAppQrInfo | null> {
  const user = await getById(usersCol(), userId);
  if (!user) return null;

  if (user.whatsapp_qr_generated_at || user.whatsapp_qr_url || user.scout_ref) {
    const updates: Partial<UserDoc> = {};
    if (!user.scout_ref) {
      user.scout_ref = buildScoutRef(user.id);
      updates.scout_ref = user.scout_ref;
    }
    const url = buildWhatsAppQrUrl(user.full_name);
    if (user.whatsapp_qr_url !== url) {
      user.whatsapp_qr_url = url;
      user.updated_at = new Date();
      updates.whatsapp_qr_url = url;
      updates.updated_at = user.updated_at;
    }
    if (Object.keys(updates).length > 0) {
      await usersCol().doc(user.id).update(updates);
    }
  }

  return toWhatsAppQrInfo(user);
}

export async function generateWhatsAppQrForUser(
  userId: string,
): Promise<WhatsAppQrInfo | null> {
  const user = await getById(usersCol(), userId);
  if (!user) return null;

  const now = new Date();
  if (!user.scout_ref) user.scout_ref = buildScoutRef(user.id);
  user.whatsapp_qr_url = buildWhatsAppQrUrl(user.full_name);
  user.whatsapp_qr_generated_at = now;
  user.updated_at = now;

  await usersCol().doc(user.id).update({
    scout_ref: user.scout_ref,
    whatsapp_qr_url: user.whatsapp_qr_url,
    whatsapp_qr_generated_at: now,
    updated_at: now,
  });

  return toWhatsAppQrInfo(user);
}

export async function getLeadsForUser(userId: string): Promise<Lead[]> {
  const leads = await leadsForVolunteer(userId);
  return leads.map(toLead);
}

export async function getLeadSummary(userId: string): Promise<LeadSummary> {
  const leads = await leadsForVolunteer(userId);
  const verified = leads.filter((l) => l.status === "verified").length;
  const unverified = leads.filter((l) => l.status === "unverified").length;
  return { verified, unverified, total: leads.length };
}

/** Build a fully-populated lead document. */
function buildLeadDoc(input: {
  id?: string;
  volunteer_id: string;
  volunteer_name: string;
  volunteer_email: string;
  student_name: string;
  student_phone: string;
  status: string;
  verified_at?: Date | null;
  whatsapp_replied_at?: Date | null;
  whatsapp_reply_text?: string | null;
  runner_location?: string | null;
  interested_in_courses?: boolean;
  neet_marks?: string | null;
  created_at: Date;
}): LeadDoc {
  return {
    id: input.id ?? randomUUID(),
    volunteer_id: input.volunteer_id,
    volunteer_name: input.volunteer_name,
    volunteer_email: input.volunteer_email,
    student_name: input.student_name,
    student_phone: input.student_phone,
    status: input.status,
    verified_at: input.verified_at ?? null,
    whatsapp_replied_at: input.whatsapp_replied_at ?? null,
    whatsapp_reply_text: input.whatsapp_reply_text ?? null,
    runner_location: input.runner_location ?? null,
    interested_in_courses: input.interested_in_courses ?? true,
    neet_marks: input.neet_marks ?? null,
    created_at: input.created_at,
  };
}

/**
 * Atomically create a lead, rejecting duplicates of student_phone.
 * Throws DuplicatePhoneError if another lead already uses that phone.
 */
export async function createLeadDoc(lead: LeadDoc): Promise<void> {
  await getDb().runTransaction(async (tx) => {
    const dup = await tx.get(
      leadsCol().where("student_phone", "==", lead.student_phone).limit(1),
    );
    if (!dup.empty) throw new DuplicatePhoneError();
    tx.set(leadsCol().doc(lead.id), lead);
  });
}

export async function createLead(
  userId: string,
  student_name: string,
  student_phone: string,
  volunteer_name: string,
  volunteer_email: string,
): Promise<{ lead: Lead; summary: LeadSummary }> {
  const lead = buildLeadDoc({
    volunteer_id: userId,
    volunteer_name: volunteer_name.trim(),
    volunteer_email: volunteer_email.trim().toLowerCase(),
    student_name: student_name.trim(),
    student_phone,
    status: "unverified",
    created_at: new Date(),
  });

  await createLeadDoc(lead);
  const summary = await getLeadSummary(userId);
  return { lead: toLead(lead), summary };
}

/** Increment a user's verified count atomically and return the new value. */
export async function incrementVerifiedCount(
  userId: string,
  now: Date,
): Promise<number> {
  return getDb().runTransaction(async (tx) => {
    const ref = usersCol().doc(userId);
    const snap = await tx.get(ref);
    const current = snap.data()?.verified_lead_count ?? 0;
    const next = current + 1;
    tx.update(ref, { verified_lead_count: next, updated_at: now });
    return next;
  });
}

async function grantMilestoneReward(
  userId: string,
  milestoneNumber: number,
  verifiedCountAtTrigger: number,
): Promise<{ milestone: MilestoneEvent; walletItem: WalletItem } | null> {
  const now = new Date();
  const mId = milestoneId(userId, milestoneNumber);
  const walletId = randomUUID();
  const couponCode = `AMZN-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;

  const created = await getDb().runTransaction(async (tx) => {
    const milestoneRef = milestoneEventsCol().doc(mId);
    const existing = await tx.get(milestoneRef);
    if (existing.exists) return false;

    tx.set(milestoneRef, {
      id: mId,
      user_id: userId,
      milestone_number: milestoneNumber,
      verified_count_at_trigger: verifiedCountAtTrigger,
      acknowledged: false,
      created_at: now,
    });
    tx.set(walletItemsCol().doc(walletId), {
      id: walletId,
      user_id: userId,
      milestone_event_id: mId,
      reward_type: "amazon_coupon",
      coupon_code: couponCode,
      coupon_value: "₹500",
      status: "active",
      earned_at: now,
      milestone_number: milestoneNumber,
    });
    return true;
  });

  if (!created) return null;

  return {
    milestone: {
      id: mId,
      user_id: userId,
      milestone_number: milestoneNumber,
      verified_count_at_trigger: verifiedCountAtTrigger,
      acknowledged: false,
      created_at: now.toISOString(),
    },
    walletItem: {
      id: walletId,
      user_id: userId,
      milestone_event_id: mId,
      reward_type: "amazon_coupon",
      coupon_code: couponCode,
      coupon_value: "₹500",
      status: "active",
      earned_at: now.toISOString(),
      milestone_number: milestoneNumber,
    },
  };
}

/** Sync verified count from leads and create any missing milestone/wallet rewards. */
export async function syncUserMilestones(userId: string): Promise<number> {
  const user = await getById(usersCol(), userId);
  if (!user) return 0;

  const leads = await leadsForVolunteer(userId);
  const verified = leads.filter((l) => l.status === "verified").length;

  await usersCol().doc(userId).update({
    verified_lead_count: verified,
    updated_at: new Date(),
  });

  const milestoneCount = Math.floor(verified / 100);
  let created = 0;
  for (let n = 1; n <= milestoneCount; n++) {
    const reward = await grantMilestoneReward(userId, n, n * 100);
    if (reward) created++;
  }
  return created;
}

export async function backfillMilestones(): Promise<void> {
  const snap = await usersCol().get();
  for (const doc of snap.docs) {
    const user = doc.data();
    const created = await syncUserMilestones(user.id);
    if (created > 0) {
      console.log(`Created ${created} milestone(s) for ${user.email}`);
    }
  }
}

export async function verifyLead(leadId: string) {
  const lead = await getById(leadsCol(), leadId);
  if (!lead || lead.status === "verified") {
    throw new Error("Lead not found or already verified");
  }

  const verifiedAt = new Date();
  await leadsCol().doc(lead.id).update({
    status: "verified",
    verified_at: verifiedAt,
  });
  lead.status = "verified";
  lead.verified_at = verifiedAt;

  const user = await getById(usersCol(), lead.volunteer_id);
  if (!user) throw new Error("Volunteer not found");

  const newCount = await incrementVerifiedCount(user.id, new Date());

  let milestone: MilestoneEvent | null = null;
  let walletItem: WalletItem | null = null;

  if (newCount % 100 === 0) {
    const reward = await grantMilestoneReward(user.id, newCount / 100, newCount);
    if (reward) {
      milestone = reward.milestone;
      walletItem = reward.walletItem;
    }
  }

  return { lead: toLead(lead), milestone, walletItem };
}

export async function grantMilestoneIfEligible(
  userId: string,
  verifiedLeadCount: number,
): Promise<MilestoneEvent | null> {
  if (verifiedLeadCount % 100 !== 0) return null;
  const reward = await grantMilestoneReward(
    userId,
    verifiedLeadCount / 100,
    verifiedLeadCount,
  );
  return reward?.milestone ?? null;
}

/**
 * On a student's first WhatsApp reply (QR flow), create or verify their lead.
 */
export async function verifyLeadFromWhatsAppFirstMessage(input: {
  volunteerId: string;
  studentPhone: string;
  studentName: string | null;
  messageText: string;
  repliedAt: Date;
}): Promise<WhatsAppLeadVerifyResult | null> {
  const volunteer = await getById(usersCol(), input.volunteerId);
  if (!volunteer) return null;

  const parsedPhone = parseIndianMobile(input.studentPhone);
  if (!parsedPhone.ok) return null;
  const student_phone = parsedPhone.phone;

  const student_name = (input.studentName?.trim() || "WhatsApp Lead").slice(0, 100);
  const now = input.repliedAt;

  const existing = await findLeadByPhone(student_phone);
  if (existing) {
    if (existing.status === "verified") {
      await leadsCol().doc(existing.id).update({
        whatsapp_replied_at: now,
        whatsapp_reply_text: input.messageText,
      });
      return {
        leadId: existing.id,
        created: false,
        verified: false,
        alreadyVerified: true,
        milestone: null,
      };
    }

    await leadsCol().doc(existing.id).update({
      status: "verified",
      verified_at: now,
      whatsapp_replied_at: now,
      whatsapp_reply_text: input.messageText,
    });

    const newCount = await incrementVerifiedCount(volunteer.id, now);
    const milestone = await grantMilestoneIfEligible(volunteer.id, newCount);

    return {
      leadId: existing.id,
      created: false,
      verified: true,
      alreadyVerified: false,
      milestone,
    };
  }

  const lead = buildLeadDoc({
    volunteer_id: volunteer.id,
    volunteer_name: volunteer.full_name,
    volunteer_email: volunteer.email,
    student_name,
    student_phone,
    status: "verified",
    verified_at: now,
    whatsapp_replied_at: now,
    whatsapp_reply_text: input.messageText,
    created_at: now,
  });

  try {
    await createLeadDoc(lead);
  } catch (error) {
    if (!(error instanceof DuplicatePhoneError)) throw error;
    // Raced with another writer — fall back to verifying the now-existing lead.
    const raced = await findLeadByPhone(student_phone);
    if (!raced) return null;
    if (raced.status !== "verified") {
      await leadsCol().doc(raced.id).update({
        status: "verified",
        verified_at: now,
        whatsapp_replied_at: now,
        whatsapp_reply_text: input.messageText,
      });
      const newCount = await incrementVerifiedCount(volunteer.id, now);
      const milestone = await grantMilestoneIfEligible(volunteer.id, newCount);
      return {
        leadId: raced.id,
        created: false,
        verified: true,
        alreadyVerified: false,
        milestone,
      };
    }
    return {
      leadId: raced.id,
      created: false,
      verified: false,
      alreadyVerified: true,
      milestone: null,
    };
  }

  const newCount = await incrementVerifiedCount(volunteer.id, now);
  const milestone = await grantMilestoneIfEligible(volunteer.id, newCount);

  return {
    leadId: lead.id,
    created: true,
    verified: true,
    alreadyVerified: false,
    milestone,
  };
}

export async function getWalletItems(userId: string): Promise<WalletItem[]> {
  const snap = await walletItemsCol().where("user_id", "==", userId).get();
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => b.earned_at.getTime() - a.earned_at.getTime())
    .map((item) => ({
      id: item.id,
      user_id: item.user_id,
      milestone_event_id: item.milestone_event_id,
      reward_type: item.reward_type as WalletItem["reward_type"],
      coupon_code: item.coupon_code,
      coupon_value: item.coupon_value,
      status: item.status as WalletItem["status"],
      earned_at: item.earned_at.toISOString(),
      milestone_number: item.milestone_number,
    }));
}

export async function getPendingMilestone(
  userId: string,
): Promise<PendingMilestone | null> {
  const snap = await milestoneEventsCol()
    .where("user_id", "==", userId)
    .where("acknowledged", "==", false)
    .get();
  if (snap.empty) return null;

  const event = snap.docs
    .map((d) => d.data())
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]!;

  const wallet = await firstOf(
    walletItemsCol().where("milestone_event_id", "==", event.id),
  );

  return {
    id: event.id,
    verified_count: event.verified_count_at_trigger,
    milestone_number: event.milestone_number,
    reward: {
      type: wallet?.reward_type ?? "amazon_coupon",
      value: wallet?.coupon_value ?? "₹500",
      preview: wallet ? `****-${wallet.coupon_code.slice(-4)}` : "****-XXXX",
    },
  };
}

export async function acknowledgeMilestone(
  userId: string,
  milestoneId: string,
): Promise<void> {
  const ref = milestoneEventsCol().doc(milestoneId);
  const snap = await ref.get();
  const event = snap.data();
  if (!event || event.user_id !== userId) {
    throw new Error("Milestone not found");
  }
  await ref.update({ acknowledged: true });
}
