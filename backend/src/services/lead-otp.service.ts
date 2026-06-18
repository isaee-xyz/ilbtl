import {
  DuplicatePhoneError,
  InvalidOtpError,
  OtpResendCooldownError,
  OtpSessionNotFoundError,
} from "../utils/errors.js";
import {
  firstOf,
  getById,
  leadsCol,
  leadOtpSessionsCol,
  usersCol,
  otpSessionId,
  type LeadOtpSessionDoc,
} from "../models/index.js";
import type { Lead, LeadSummary } from "../types/index.js";
import { parseIndianMobile } from "../utils/validators.js";
import {
  createLeadDoc,
  getLeadSummary,
  grantMilestoneIfEligible,
  incrementVerifiedCount,
  toLead,
} from "./lead.service.js";
import { pushLeadToLsq } from "./lsq.service.js";
import { randomUUID } from "crypto";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;

function assertValidPhone(phone: string): string {
  const parsed = parseIndianMobile(phone);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.phone;
}

async function assertPhoneAvailable(student_phone: string): Promise<void> {
  const existing = await firstOf(
    leadsCol().where("student_phone", "==", student_phone),
  );
  if (existing) throw new DuplicatePhoneError();
}

function secondsUntilResendAllowed(lastSentAt: Date): number {
  const elapsed = Date.now() - lastSentAt.getTime();
  const remaining = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
  return Math.max(0, remaining);
}

/** Load an OTP session, treating an expired one as absent (no Firestore TTL). */
async function getActiveSession(
  volunteerId: string,
  studentPhone: string,
): Promise<LeadOtpSessionDoc | null> {
  const id = otpSessionId(volunteerId, studentPhone);
  const session = await getById(leadOtpSessionsCol(), id);
  if (!session) return null;
  if (session.expires_at.getTime() < Date.now()) {
    await leadOtpSessionsCol().doc(id).delete();
    return null;
  }
  return session;
}

async function upsertOtpSession(input: {
  volunteerId: string;
  studentName: string;
  studentPhone: string;
  interestedInCourses: boolean;
  neetMarks: string | null;
  otp: string;
}): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const id = otpSessionId(input.volunteerId, input.studentPhone);

  const session: LeadOtpSessionDoc = {
    id,
    volunteer_id: input.volunteerId,
    student_name: input.studentName.trim(),
    student_phone: input.studentPhone,
    interested_in_courses: input.interestedInCourses,
    neet_marks: input.neetMarks,
    otp: input.otp,
    expires_at: expiresAt,
    last_sent_at: now,
    created_at: now,
  };
  await leadOtpSessionsCol().doc(id).set(session);
}

export async function startLeadOtpSession(input: {
  volunteerId: string;
  studentName: string;
  studentPhone: string;
  interestedInCourses: boolean;
  neetMarks: string | null;
  otp: string;
}): Promise<{ expiresInSeconds: number; resendAvailableInSeconds: number }> {
  const student_phone = assertValidPhone(input.studentPhone);
  await assertPhoneAvailable(student_phone);

  await upsertOtpSession({
    volunteerId: input.volunteerId,
    studentName: input.studentName,
    studentPhone: student_phone,
    interestedInCourses: input.interestedInCourses,
    neetMarks: input.neetMarks,
    otp: input.otp,
  });

  return {
    expiresInSeconds: OTP_TTL_MS / 1000,
    resendAvailableInSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
  };
}

export async function resendLeadOtpSession(input: {
  volunteerId: string;
  studentPhone: string;
  otp: string;
}): Promise<{ expiresInSeconds: number; resendAvailableInSeconds: number }> {
  const student_phone = assertValidPhone(input.studentPhone);
  await assertPhoneAvailable(student_phone);

  const session = await getActiveSession(input.volunteerId, student_phone);
  if (!session) throw new OtpSessionNotFoundError();

  const waitSeconds = secondsUntilResendAllowed(session.last_sent_at);
  if (waitSeconds > 0) {
    throw new OtpResendCooldownError(waitSeconds);
  }

  const now = new Date();
  await leadOtpSessionsCol().doc(session.id).update({
    otp: input.otp,
    expires_at: new Date(now.getTime() + OTP_TTL_MS),
    last_sent_at: now,
  });

  return {
    expiresInSeconds: OTP_TTL_MS / 1000,
    resendAvailableInSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
  };
}

async function syncLeadToLsq(input: {
  student_name: string;
  student_phone: string;
  status: "verified" | "unverified";
  interested_in_courses: boolean;
  neet_marks: string | null;
  runner_location: string | null;
  runner_city: string | null;
  runner_state: string | null;
  volunteer_name: string;
  volunteer_email: string;
}): Promise<void> {
  const result = await pushLeadToLsq(input);
  if (!result.ok && !result.skipped) {
    console.error("[LSQ] lead sync failed:", result.error);
  }
}

export async function verifyLeadOtpAndCreate(input: {
  volunteerId: string;
  studentPhone: string;
  otp: string;
  volunteerName: string;
  volunteerEmail: string;
  runnerLocation?: string | null;
  runnerCity?: string | null;
  runnerState?: string | null;
}): Promise<{ lead: Lead; summary: LeadSummary }> {
  const student_phone = assertValidPhone(input.studentPhone);
  const otp = input.otp.trim();

  if (!/^\d{6}$/.test(otp)) throw new InvalidOtpError();

  const session = await getActiveSession(input.volunteerId, student_phone);
  if (!session) throw new OtpSessionNotFoundError();
  if (session.otp !== otp) throw new InvalidOtpError();

  await assertPhoneAvailable(student_phone);

  const volunteer = await getById(usersCol(), input.volunteerId);
  if (!volunteer) throw new Error("Volunteer not found");

  const now = new Date();
  const lead = {
    id: randomUUID(),
    volunteer_id: input.volunteerId,
    volunteer_name: input.volunteerName.trim(),
    volunteer_email: input.volunteerEmail.trim().toLowerCase(),
    student_name: session.student_name,
    student_phone,
    status: "verified",
    verified_at: now,
    whatsapp_replied_at: null,
    whatsapp_reply_text: null,
    runner_location: input.runnerLocation ?? null,
    interested_in_courses: session.interested_in_courses,
    neet_marks: session.neet_marks ?? null,
    created_at: now,
  };

  await createLeadDoc(lead);

  const newCount = await incrementVerifiedCount(volunteer.id, now);
  await grantMilestoneIfEligible(volunteer.id, newCount);
  await leadOtpSessionsCol().doc(session.id).delete();

  const summary = await getLeadSummary(input.volunteerId);
  const leadRecord = toLead(lead);

  void syncLeadToLsq({
    student_name: leadRecord.student_name,
    student_phone: leadRecord.student_phone,
    status: "verified",
    interested_in_courses: session.interested_in_courses,
    neet_marks: session.neet_marks ?? null,
    runner_location: input.runnerLocation ?? null,
    runner_city: input.runnerCity ?? null,
    runner_state: input.runnerState ?? null,
    volunteer_name: input.volunteerName.trim(),
    volunteer_email: input.volunteerEmail.trim().toLowerCase(),
  });

  return { lead: leadRecord, summary };
}

export async function savePendingLeadFromSession(input: {
  volunteerId: string;
  studentPhone: string;
  volunteerName: string;
  volunteerEmail: string;
  runnerLocation?: string | null;
  runnerCity?: string | null;
  runnerState?: string | null;
}): Promise<{ lead: Lead; summary: LeadSummary }> {
  const student_phone = assertValidPhone(input.studentPhone);

  const session = await getActiveSession(input.volunteerId, student_phone);
  if (!session) throw new OtpSessionNotFoundError();

  await assertPhoneAvailable(student_phone);

  const now = new Date();
  const lead = {
    id: randomUUID(),
    volunteer_id: input.volunteerId,
    volunteer_name: input.volunteerName.trim(),
    volunteer_email: input.volunteerEmail.trim().toLowerCase(),
    student_name: session.student_name,
    student_phone,
    status: "unverified",
    verified_at: null,
    whatsapp_replied_at: null,
    whatsapp_reply_text: null,
    runner_location: input.runnerLocation ?? null,
    interested_in_courses: session.interested_in_courses,
    neet_marks: session.neet_marks ?? null,
    created_at: now,
  };

  await createLeadDoc(lead);
  await leadOtpSessionsCol().doc(session.id).delete();

  const summary = await getLeadSummary(input.volunteerId);
  const leadRecord = toLead(lead);

  void syncLeadToLsq({
    student_name: leadRecord.student_name,
    student_phone: leadRecord.student_phone,
    status: "unverified",
    interested_in_courses: session.interested_in_courses,
    neet_marks: session.neet_marks ?? null,
    runner_location: input.runnerLocation ?? null,
    runner_city: input.runnerCity ?? null,
    runner_state: input.runnerState ?? null,
    volunteer_name: input.volunteerName.trim(),
    volunteer_email: input.volunteerEmail.trim().toLowerCase(),
  });

  return { lead: leadRecord, summary };
}
