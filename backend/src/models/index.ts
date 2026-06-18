import {
  Timestamp,
  FieldValue,
  type CollectionReference,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type Query,
} from "firebase-admin/firestore";
import { getDb } from "../config/firebase.js";

export { FieldValue };

// ── Document shapes (stored in Firestore, Dates ↔ Timestamps) ─────────────────

export interface UserDoc {
  id: string;
  firebase_uid: string;
  email: string;
  full_name: string;
  photo_url: string | null;
  verified_lead_count: number;
  whatsapp_qr_url: string | null;
  whatsapp_qr_generated_at: Date | null;
  scout_ref: string | null;
  last_login_location: string | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface LeadDoc {
  id: string;
  volunteer_id: string;
  volunteer_name: string;
  volunteer_email: string;
  student_name: string;
  student_phone: string;
  status: string;
  verified_at: Date | null;
  whatsapp_replied_at: Date | null;
  whatsapp_reply_text: string | null;
  runner_location: string | null;
  interested_in_courses: boolean;
  neet_marks: string | null;
  created_at: Date;
}

export interface WalletItemDoc {
  id: string;
  user_id: string;
  milestone_event_id: string;
  reward_type: string;
  coupon_code: string;
  coupon_value: string;
  status: string;
  earned_at: Date;
  milestone_number: number;
}

export interface MilestoneEventDoc {
  id: string;
  user_id: string;
  milestone_number: number;
  verified_count_at_trigger: number;
  acknowledged: boolean;
  created_at: Date;
}

export interface LeadOtpSessionDoc {
  id: string;
  volunteer_id: string;
  student_name: string;
  student_phone: string;
  interested_in_courses: boolean;
  neet_marks: string | null;
  otp: string;
  expires_at: Date;
  last_sent_at: Date;
  created_at: Date;
}

export interface WhatsAppInboundDoc {
  id: string;
  gupshup_message_id: string | null;
  from_phone: string;
  to_phone: string | null;
  message_text: string;
  sender_name: string | null;
  scout_ref: string | null;
  lead_id: string | null;
  volunteer_id: string | null;
  volunteer_name: string | null;
  volunteer_email: string | null;
  user_input: string | null;
  raw_payload: unknown;
  received_at: Date;
}

// ── Timestamp → Date conversion on read ───────────────────────────────────────

function convertTimestamps(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(convertTimestamps);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = convertTimestamps(v);
    }
    return out;
  }
  return value;
}

function converter<T>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data) => data as Record<string, unknown>,
    fromFirestore: (snap: QueryDocumentSnapshot) =>
      convertTimestamps(snap.data()) as T,
  };
}

// ── Typed collection accessors ────────────────────────────────────────────────

export const usersCol = (): CollectionReference<UserDoc> =>
  getDb().collection("users").withConverter(converter<UserDoc>());

export const leadsCol = (): CollectionReference<LeadDoc> =>
  getDb().collection("leads").withConverter(converter<LeadDoc>());

export const walletItemsCol = (): CollectionReference<WalletItemDoc> =>
  getDb().collection("walletItems").withConverter(converter<WalletItemDoc>());

export const milestoneEventsCol = (): CollectionReference<MilestoneEventDoc> =>
  getDb().collection("milestoneEvents").withConverter(converter<MilestoneEventDoc>());

export const leadOtpSessionsCol = (): CollectionReference<LeadOtpSessionDoc> =>
  getDb().collection("leadOtpSessions").withConverter(converter<LeadOtpSessionDoc>());

export const whatsAppInboundCol = (): CollectionReference<WhatsAppInboundDoc> =>
  getDb().collection("whatsAppInbound").withConverter(converter<WhatsAppInboundDoc>());

// ── Deterministic document IDs (replace Mongo unique indexes) ─────────────────

/** One OTP session per (volunteer, phone). */
export const otpSessionId = (volunteerId: string, studentPhone: string): string =>
  `${volunteerId}__${studentPhone}`;

/** One milestone event per (user, milestone number). */
export const milestoneId = (userId: string, milestoneNumber: number): string =>
  `${userId}_${milestoneNumber}`;

// ── Small query helpers ───────────────────────────────────────────────────────

/** First document of a query, with Timestamps already converted, or null. */
export async function firstOf<T>(query: Query<T>): Promise<T | null> {
  const snap = await query.limit(1).get();
  return snap.empty ? null : snap.docs[0]!.data();
}

/** Get a document by id from a collection, or null. */
export async function getById<T>(
  col: CollectionReference<T>,
  id: string,
): Promise<T | null> {
  const snap = await col.doc(id).get();
  return snap.exists ? (snap.data() as T) : null;
}
