import { randomUUID } from "crypto";
import { DuplicatePhoneError } from "../utils/errors.js";
import {
  LeadModel,
  MilestoneEventModel,
  UserModel,
  WalletItemModel,
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

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: number }).code === 11000
  );
}

function toUserRecord(user: {
  id: string;
  firebase_uid: string;
  email: string;
  full_name: string;
  photo_url?: string | null;
  verified_lead_count: number;
  whatsapp_qr_url?: string | null;
  whatsapp_qr_generated_at?: Date | null;
  last_login_location?: string | null;
  last_login_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}): UserRecord {
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

export function toLead(lead: {
  id: string;
  volunteer_id: string;
  volunteer_name?: string;
  volunteer_email?: string;
  student_name: string;
  student_phone: string;
  status: string;
  verified_at?: Date | null;
  runner_location?: string | null;
  interested_in_courses?: boolean;
  neet_marks?: string | null;
  created_at: Date;
}): Lead {
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

export async function backfillLeadVolunteerFields(): Promise<void> {
  const leads = await LeadModel.find({
    $or: [
      { volunteer_name: { $exists: false } },
      { volunteer_email: { $exists: false } },
    ],
  });

  for (const lead of leads) {
    const user = await UserModel.findOne({ id: lead.volunteer_id });
    if (!user) continue;
    lead.volunteer_name = user.full_name;
    lead.volunteer_email = user.email;
    await lead.save();
  }
}

export async function getRunnerLeadStats(
  minLeads = 100,
): Promise<RunnerLeadStats[]> {
  const rows = await LeadModel.aggregate<{
    _id: string;
    volunteer_name: string;
    volunteer_email: string;
    total_leads: number;
    verified_leads: number;
  }>([
    {
      $group: {
        _id: "$volunteer_id",
        volunteer_name: { $first: "$volunteer_name" },
        volunteer_email: { $first: "$volunteer_email" },
        total_leads: { $sum: 1 },
        verified_leads: {
          $sum: { $cond: [{ $eq: ["$status", "verified"] }, 1, 0] },
        },
      },
    },
    { $match: { total_leads: { $gte: minLeads } } },
    { $sort: { total_leads: -1 } },
  ]);

  return rows.map((row) => ({
    volunteer_id: row._id,
    volunteer_name: row.volunteer_name ?? "Unknown",
    volunteer_email: row.volunteer_email ?? "",
    total_leads: row.total_leads,
    verified_leads: row.verified_leads,
    unverified_leads: row.total_leads - row.verified_leads,
  }));
}

export async function upsertUser(input: {
  firebase_uid: string;
  email: string;
  full_name: string;
  photo_url: string | null;
}): Promise<UserRecord> {
  const now = new Date();
  const existing = await UserModel.findOne({ firebase_uid: input.firebase_uid });

  if (existing) {
    existing.email = input.email;
    existing.full_name = input.full_name;
    existing.photo_url = input.photo_url;
    existing.updated_at = now;
    await existing.save();
    return toUserRecord(existing);
  }

  const user = await UserModel.create({
    id: randomUUID(),
    firebase_uid: input.firebase_uid,
    email: input.email,
    full_name: input.full_name,
    photo_url: input.photo_url,
    verified_lead_count: 0,
    created_at: now,
    updated_at: now,
  });
  return toUserRecord(user);
}

export async function getUserByFirebaseUid(
  firebase_uid: string,
): Promise<UserRecord | null> {
  const user = await UserModel.findOne({ firebase_uid });
  return user ? toUserRecord(user) : null;
}

function resolveWhatsAppQrUrl(user: {
  id: string;
  full_name: string;
  scout_ref?: string | null;
  whatsapp_qr_url?: string | null;
  whatsapp_qr_generated_at?: Date | null;
}): string | null {
  const hasQr =
    Boolean(user.whatsapp_qr_generated_at) ||
    Boolean(user.whatsapp_qr_url) ||
    Boolean(user.scout_ref);

  if (!hasQr) return null;

  return buildWhatsAppQrUrl(user.full_name);
}

function toWhatsAppQrInfo(user: {
  id: string;
  full_name: string;
  scout_ref?: string | null;
  whatsapp_qr_url?: string | null;
  whatsapp_qr_generated_at?: Date | null;
}): WhatsAppQrInfo {
  const url = resolveWhatsAppQrUrl(user);
  return {
    generated: Boolean(url),
    url,
    generated_at: user.whatsapp_qr_generated_at?.toISOString() ?? null,
  };
}

export async function getWhatsAppQrForUser(
  userId: string,
): Promise<WhatsAppQrInfo | null> {
  const user = await UserModel.findOne({ id: userId });
  if (!user) return null;

  if (user.whatsapp_qr_generated_at || user.whatsapp_qr_url || user.scout_ref) {
    if (!user.scout_ref) {
      user.scout_ref = buildScoutRef(user.id);
    }
    const url = buildWhatsAppQrUrl(user.full_name);
    if (user.whatsapp_qr_url !== url) {
      user.whatsapp_qr_url = url;
      user.updated_at = new Date();
      await user.save();
    }
  }

  return toWhatsAppQrInfo(user);
}

export async function generateWhatsAppQrForUser(
  userId: string,
): Promise<WhatsAppQrInfo | null> {
  const user = await UserModel.findOne({ id: userId });
  if (!user) return null;

  const now = new Date();
  if (!user.scout_ref) {
    user.scout_ref = buildScoutRef(user.id);
  }
  user.whatsapp_qr_url = buildWhatsAppQrUrl(user.full_name);
  user.whatsapp_qr_generated_at = now;
  user.updated_at = now;
  await user.save();

  return toWhatsAppQrInfo(user);
}

export async function getLeadsForUser(userId: string): Promise<Lead[]> {
  const leads = await LeadModel.find({ volunteer_id: userId })
    .sort({ created_at: -1 })
    .lean();
  return leads.map(toLead);
}

export async function getLeadSummary(userId: string): Promise<LeadSummary> {
  const [verified, unverified, total] = await Promise.all([
    LeadModel.countDocuments({ volunteer_id: userId, status: "verified" }),
    LeadModel.countDocuments({ volunteer_id: userId, status: "unverified" }),
    LeadModel.countDocuments({ volunteer_id: userId }),
  ]);
  return { verified, unverified, total };
}

export async function createLead(
  userId: string,
  student_name: string,
  student_phone: string,
  volunteer_name: string,
  volunteer_email: string,
): Promise<{ lead: Lead; summary: LeadSummary }> {
  const trimmedName = student_name.trim();
  const now = new Date();

  try {
    const lead = await LeadModel.create({
      id: randomUUID(),
      volunteer_id: userId,
      volunteer_name: volunteer_name.trim(),
      volunteer_email: volunteer_email.trim().toLowerCase(),
      student_name: trimmedName,
      student_phone,
      status: "unverified",
      verified_at: null,
      created_at: now,
    });
    const summary = await getLeadSummary(userId);
    return { lead: toLead(lead), summary };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new DuplicatePhoneError();
    }
    throw error;
  }
}

async function grantMilestoneReward(
  userId: string,
  milestoneNumber: number,
  verifiedCountAtTrigger: number,
): Promise<{ milestone: MilestoneEvent; walletItem: WalletItem } | null> {
  const existing = await MilestoneEventModel.findOne({
    user_id: userId,
    milestone_number: milestoneNumber,
  });
  if (existing) return null;

  const now = new Date();
  const milestoneId = randomUUID();
  const walletId = randomUUID();
  const couponCode = `AMZN-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;

  const createdMilestone = await MilestoneEventModel.create({
    id: milestoneId,
    user_id: userId,
    milestone_number: milestoneNumber,
    verified_count_at_trigger: verifiedCountAtTrigger,
    acknowledged: false,
    created_at: now,
  });

  const createdWallet = await WalletItemModel.create({
    id: walletId,
    user_id: userId,
    milestone_event_id: milestoneId,
    reward_type: "amazon_coupon",
    coupon_code: couponCode,
    coupon_value: "₹500",
    status: "active",
    earned_at: now,
    milestone_number: milestoneNumber,
  });

  return {
    milestone: {
      id: createdMilestone.id,
      user_id: createdMilestone.user_id,
      milestone_number: createdMilestone.milestone_number,
      verified_count_at_trigger: createdMilestone.verified_count_at_trigger,
      acknowledged: createdMilestone.acknowledged,
      created_at: createdMilestone.created_at.toISOString(),
    },
    walletItem: {
      id: createdWallet.id,
      user_id: createdWallet.user_id,
      milestone_event_id: createdWallet.milestone_event_id,
      reward_type: "amazon_coupon",
      coupon_code: createdWallet.coupon_code,
      coupon_value: createdWallet.coupon_value,
      status: createdWallet.status as WalletItem["status"],
      earned_at: createdWallet.earned_at.toISOString(),
      milestone_number: createdWallet.milestone_number,
    },
  };
}

/** Sync verified count from leads and create any missing milestone/wallet rewards. */
export async function syncUserMilestones(userId: string): Promise<number> {
  const user = await UserModel.findOne({ id: userId });
  if (!user) return 0;

  const verified = await LeadModel.countDocuments({
    volunteer_id: userId,
    status: "verified",
  });

  user.verified_lead_count = verified;
  user.updated_at = new Date();
  await user.save();

  const milestoneCount = Math.floor(verified / 100);
  let created = 0;

  for (let milestoneNumber = 1; milestoneNumber <= milestoneCount; milestoneNumber++) {
    const reward = await grantMilestoneReward(
      userId,
      milestoneNumber,
      milestoneNumber * 100,
    );
    if (reward) created++;
  }

  return created;
}

export async function backfillMilestones(): Promise<void> {
  const users = await UserModel.find().lean();
  for (const user of users) {
    const created = await syncUserMilestones(user.id);
    if (created > 0) {
      console.log(`Created ${created} milestone(s) for ${user.email}`);
    }
  }
}

export async function verifyLead(leadId: string) {
  const lead = await LeadModel.findOne({ id: leadId });
  if (!lead || lead.status === "verified") {
    throw new Error("Lead not found or already verified");
  }

  const verifiedAt = new Date();
  lead.status = "verified";
  lead.verified_at = verifiedAt;
  await lead.save();

  const user = await UserModel.findOne({ id: lead.volunteer_id });
  if (!user) throw new Error("Volunteer not found");

  user.verified_lead_count += 1;
  user.updated_at = new Date();
  await user.save();

  let milestone: MilestoneEvent | null = null;
  let walletItem: WalletItem | null = null;

  if (user.verified_lead_count % 100 === 0) {
    const milestoneNumber = user.verified_lead_count / 100;
    const reward = await grantMilestoneReward(
      user.id,
      milestoneNumber,
      user.verified_lead_count,
    );
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

  const milestoneNumber = verifiedLeadCount / 100;
  const reward = await grantMilestoneReward(
    userId,
    milestoneNumber,
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
  const volunteer = await UserModel.findOne({ id: input.volunteerId });
  if (!volunteer) return null;

  const parsedPhone = parseIndianMobile(input.studentPhone);
  if (!parsedPhone.ok) return null;
  const student_phone = parsedPhone.phone;

  const student_name = (input.studentName?.trim() || "WhatsApp Lead").slice(
    0,
    100,
  );
  const now = input.repliedAt;

  let existing = await LeadModel.findOne({ student_phone });
  if (existing) {
    if (existing.status === "verified") {
      existing.whatsapp_replied_at = now;
      existing.whatsapp_reply_text = input.messageText;
      await existing.save();
      return {
        leadId: existing.id,
        created: false,
        verified: false,
        alreadyVerified: true,
        milestone: null,
      };
    }

    existing.status = "verified";
    existing.verified_at = now;
    existing.whatsapp_replied_at = now;
    existing.whatsapp_reply_text = input.messageText;
    await existing.save();

    volunteer.verified_lead_count += 1;
    volunteer.updated_at = now;
    await volunteer.save();

    const milestone = await grantMilestoneIfEligible(
      volunteer.id,
      volunteer.verified_lead_count,
    );

    return {
      leadId: existing.id,
      created: false,
      verified: true,
      alreadyVerified: false,
      milestone,
    };
  }

  try {
    const lead = await LeadModel.create({
      id: randomUUID(),
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

    volunteer.verified_lead_count += 1;
    volunteer.updated_at = now;
    await volunteer.save();

    const milestone = await grantMilestoneIfEligible(
      volunteer.id,
      volunteer.verified_lead_count,
    );

    return {
      leadId: lead.id,
      created: true,
      verified: true,
      alreadyVerified: false,
      milestone,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    existing = await LeadModel.findOne({ student_phone });
    if (!existing) return null;

    if (existing.status === "verified") {
      existing.whatsapp_replied_at = now;
      existing.whatsapp_reply_text = input.messageText;
      await existing.save();
      return {
        leadId: existing.id,
        created: false,
        verified: false,
        alreadyVerified: true,
        milestone: null,
      };
    }

    existing.status = "verified";
    existing.verified_at = now;
    existing.whatsapp_replied_at = now;
    existing.whatsapp_reply_text = input.messageText;
    await existing.save();

    volunteer.verified_lead_count += 1;
    volunteer.updated_at = now;
    await volunteer.save();

    const milestone = await grantMilestoneIfEligible(
      volunteer.id,
      volunteer.verified_lead_count,
    );

    return {
      leadId: existing.id,
      created: false,
      verified: true,
      alreadyVerified: false,
      milestone,
    };
  }
}

export async function getWalletItems(userId: string): Promise<WalletItem[]> {
  const items = await WalletItemModel.find({ user_id: userId })
    .sort({ earned_at: -1 })
    .lean();

  return items.map((item) => ({
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
  const event = await MilestoneEventModel.findOne({
    user_id: userId,
    acknowledged: false,
  })
    .sort({ created_at: -1 })
    .lean();
  if (!event) return null;

  const wallet = await WalletItemModel.findOne({
    milestone_event_id: event.id,
  }).lean();

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
  const result = await MilestoneEventModel.updateOne(
    { id: milestoneId, user_id: userId },
    { $set: { acknowledged: true } },
  );
  if (result.matchedCount === 0) throw new Error("Milestone not found");
}
