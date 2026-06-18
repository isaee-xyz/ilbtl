import { randomUUID } from "crypto";
import {
  firstOf,
  leadsCol,
  usersCol,
  whatsAppInboundCol,
} from "../models/index.js";
import { verifyLeadFromWhatsAppFirstMessage } from "./lead.service.js";
import { WHATSAPP_QR_MESSAGE_PREFIX } from "../utils/whatsapp-qr.js";
import { parseIndianMobile } from "../utils/validators.js";

export interface ParsedInboundMessage {
  messageId: string | null;
  fromPhone: string;
  toPhone: string | null;
  text: string;
  senderName: string | null;
  raw: unknown;
}

export interface WebhookProcessResult {
  saved: boolean;
  duplicate: boolean;
  inboundId?: string;
  matchedLeadId?: string;
  matchedVolunteerId?: string;
  leadVerified?: boolean;
  leadCreated?: boolean;
  alreadyVerified?: boolean;
}

const SCOUT_REF_PATTERN = /Ref:\s*(SCOUT-[A-Za-z0-9-]+)/i;

function readStringField(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

/** Gupshup Journey may POST JSON as a form field name (urlencoded). */
export function normalizeWebhookBody(body: unknown): unknown {
  if (typeof body === "string") {
    const parsed = parseJsonString(body);
    return parsed !== body ? parsed : body;
  }

  if (!body || typeof body !== "object") return body;

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length === 1 && keys[0].trim().startsWith("{")) {
    const parsed = parseJsonString(keys[0]);
    if (parsed && typeof parsed === "object") return parsed;
  }

  for (const key of keys) {
    if (key.trim().startsWith("{")) {
      const parsed = parseJsonString(key);
      if (parsed && typeof parsed === "object") return parsed;
    }
  }

  if (typeof record.payload === "string") {
    const parsed = parseJsonString(record.payload);
    if (parsed && typeof parsed === "object") return parsed;
  }

  if (typeof record.body === "string") {
    const parsed = parseJsonString(record.body);
    if (parsed && typeof parsed === "object") return parsed;
  }

  return body;
}

/** Meta / Gupshup passthrough: entry[].changes[].value.messages[] */
function parseMetaStyleWebhook(
  record: Record<string, unknown>,
): ParsedInboundMessage | null {
  const entry = record.entry;
  if (!Array.isArray(entry)) return null;

  for (const entryItem of entry) {
    if (!entryItem || typeof entryItem !== "object") continue;
    const changes = (entryItem as Record<string, unknown>).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as Record<string, unknown>).value;
      if (!value || typeof value !== "object") continue;

      const messages = (value as Record<string, unknown>).messages;
      if (!Array.isArray(messages) || messages.length === 0) continue;

      const message = messages[0];
      if (!message || typeof message !== "object") continue;
      const msg = message as Record<string, unknown>;

      const fromPhone = String(msg.from ?? "").replace(/\D/g, "");
      const textObj = msg.text;
      const text =
        textObj && typeof textObj === "object"
          ? readStringField(textObj as Record<string, unknown>, "body")
          : readStringField(msg, "body", "text");

      if (!fromPhone || !text) continue;

      const metadata =
        (value as Record<string, unknown>).metadata &&
        typeof (value as Record<string, unknown>).metadata === "object"
          ? ((value as Record<string, unknown>).metadata as Record<string, unknown>)
          : null;

      return {
        messageId: readStringField(msg, "id"),
        fromPhone,
        toPhone: metadata
          ? readStringField(metadata, "display_phone_number")?.replace(/\D/g, "") ??
            null
          : null,
        text,
        senderName: readStringField(msg, "from_name", "name"),
        raw: record,
      };
    }
  }

  return null;
}

function extractMessageText(
  messagePayload: Record<string, unknown>,
  root: Record<string, unknown>,
  record: Record<string, unknown>,
): string {
  const direct =
    readStringField(messagePayload, "text", "body", "caption", "title") ??
    readStringField(root, "text", "body") ??
    readStringField(record, "text", "body");

  if (direct) return direct;

  const buttonReply = messagePayload.button_reply;
  if (buttonReply && typeof buttonReply === "object") {
    return (
      readStringField(buttonReply as Record<string, unknown>, "title", "text") ??
      ""
    );
  }

  const listReply = messagePayload.list_reply;
  if (listReply && typeof listReply === "object") {
    return (
      readStringField(listReply as Record<string, unknown>, "title", "description") ??
      ""
    );
  }

  return "";
}

/** Gupshup journey webhook: user-name, user_number, user_input */
function parseGupshupJourneyWebhook(
  record: Record<string, unknown>,
): ParsedInboundMessage | null {
  const userNumber = readStringField(
    record,
    "user_number",
    "user-number",
    "userNumber",
  );
  const userInput = readStringField(
    record,
    "user_input",
    "user-input",
    "userInput",
  );

  if (!userNumber || !userInput) return null;

  const fromPhone = userNumber.replace(/\D/g, "");
  if (!fromPhone) return null;

  const toRaw = readStringField(record, "to_phone", "toPhone", "destination");
  const toPhone = toRaw ? toRaw.replace(/\D/g, "") || null : null;

  return {
    messageId:
      readStringField(record, "message_id", "messageId", "id") ?? null,
    fromPhone,
    toPhone,
    text: userInput,
    senderName: readStringField(
      record,
      "user-name",
      "user_name",
      "userName",
    ),
    raw: record,
  };
}

export function parseGupshupWebhookBody(body: unknown): ParsedInboundMessage | null {
  const normalized = normalizeWebhookBody(body);
  if (!normalized || typeof normalized !== "object") return null;

  const record = normalized as Record<string, unknown>;

  const journeyParsed = parseGupshupJourneyWebhook(record);
  if (journeyParsed) return journeyParsed;

  const metaParsed = parseMetaStyleWebhook(record);
  if (metaParsed) return metaParsed;

  let payload = parseJsonString(record.payload);

  const root = (payload && typeof payload === "object" ? payload : record) as Record<
    string,
    unknown
  >;

  const type = String(record.type ?? root.type ?? "").toLowerCase();
  if (
    type &&
    type !== "message" &&
    type !== "text" &&
    !type.endsWith("-reply")
  ) {
    return null;
  }

  const messagePayload =
    root.payload && typeof root.payload === "object"
      ? (parseJsonString(root.payload) as Record<string, unknown>)
      : root;

  const text = extractMessageText(messagePayload, root, record);

  const senderObj =
    root.sender && typeof root.sender === "object"
      ? (root.sender as Record<string, unknown>)
      : null;

  const fromPhone = String(
    root.source ??
      senderObj?.phone ??
      messagePayload.from ??
      record.mobile ??
      record.phone ??
      "",
  ).replace(/\D/g, "");

  if (!fromPhone || !text.trim()) return null;

  const toPhone = String(root.destination ?? root.to ?? "")
    .replace(/\D/g, "") || null;

  return {
    messageId: String(root.id ?? record.id ?? "") || null,
    fromPhone,
    toPhone,
    text: text.trim(),
    senderName:
      typeof senderObj?.name === "string"
        ? senderObj.name
        : typeof root.name === "string"
          ? root.name
          : null,
    raw: body,
  };
}

function extractScoutRef(text: string): string | null {
  const match = text.match(SCOUT_REF_PATTERN);
  return match?.[1]?.toUpperCase() ?? null;
}

/** Volunteer name from QR pre-fill: "Interested to know more about the courses {name}" */
function extractVolunteerNameFromQrMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.toLowerCase().startsWith(WHATSAPP_QR_MESSAGE_PREFIX.toLowerCase())) {
    return null;
  }

  const namePart = trimmed.slice(WHATSAPP_QR_MESSAGE_PREFIX.length).trim();
  if (!namePart) return null;

  return namePart.replace(/\s*\(Ref:\s*SCOUT-[A-Za-z0-9-]+\)\s*$/i, "").trim() || null;
}

async function matchVolunteerFromMessage(text: string): Promise<{
  volunteerId?: string;
  volunteerName?: string;
  volunteerEmail?: string;
  scoutRef: string | null;
}> {
  const scoutRefFromText = extractScoutRef(text);

  if (scoutRefFromText) {
    const volunteer = await firstOf(
      usersCol().where("scout_ref", "==", scoutRefFromText),
    );
    if (volunteer) {
      return {
        volunteerId: volunteer.id,
        volunteerName: volunteer.full_name,
        volunteerEmail: volunteer.email,
        scoutRef: volunteer.scout_ref ?? scoutRefFromText,
      };
    }
  }

  const volunteerName = extractVolunteerNameFromQrMessage(text);
  if (volunteerName) {
    // Firestore has no case-insensitive query — scan volunteers (small set).
    const target = volunteerName.toLowerCase();
    const snap = await usersCol().get();
    const volunteer = snap.docs
      .map((d) => d.data())
      .find((u) => u.full_name.toLowerCase() === target);
    if (volunteer) {
      return {
        volunteerId: volunteer.id,
        volunteerName: volunteer.full_name,
        volunteerEmail: volunteer.email,
        scoutRef: volunteer.scout_ref ?? null,
      };
    }
  }

  return { scoutRef: scoutRefFromText };
}

export async function processInboundWhatsApp(
  parsed: ParsedInboundMessage,
): Promise<WebhookProcessResult> {
  if (parsed.messageId) {
    const existing = await firstOf(
      whatsAppInboundCol().where("gupshup_message_id", "==", parsed.messageId),
    );
    if (existing) {
      return { saved: false, duplicate: true, inboundId: existing.id };
    }
  }

  const volunteerMatch = await matchVolunteerFromMessage(parsed.text);
  const scoutRef = volunteerMatch.scoutRef;
  let matchedVolunteerId = volunteerMatch.volunteerId;
  let matchedVolunteerName = volunteerMatch.volunteerName;
  let matchedVolunteerEmail = volunteerMatch.volunteerEmail;
  let matchedLeadId: string | undefined;
  let leadVerified = false;
  let leadCreated = false;
  let alreadyVerified = false;

  const repliedAt = new Date();

  if (matchedVolunteerId) {
    const verifyResult = await verifyLeadFromWhatsAppFirstMessage({
      volunteerId: matchedVolunteerId,
      studentPhone: parsed.fromPhone,
      studentName: parsed.senderName,
      messageText: parsed.text,
      repliedAt,
    });

    if (verifyResult) {
      matchedLeadId = verifyResult.leadId;
      leadVerified = verifyResult.verified;
      leadCreated = verifyResult.created;
      alreadyVerified = verifyResult.alreadyVerified;
    } else {
      console.warn("[webhook] Could not create/verify lead:", {
        fromPhone: parsed.fromPhone,
        scoutRef,
        volunteerId: matchedVolunteerId,
      });
    }
  } else {
    // Match the sender's number against a stored (normalised) lead phone.
    const parsedPhone = parseIndianMobile(parsed.fromPhone);
    const lead = parsedPhone.ok
      ? await firstOf(leadsCol().where("student_phone", "==", parsedPhone.phone))
      : null;
    if (lead) {
      matchedLeadId = lead.id;
      await leadsCol().doc(lead.id).update({
        whatsapp_replied_at: repliedAt,
        whatsapp_reply_text: parsed.text,
      });
    }
  }

  const inboundId = randomUUID();
  await whatsAppInboundCol().doc(inboundId).set({
    id: inboundId,
    gupshup_message_id: parsed.messageId,
    from_phone: parsed.fromPhone,
    to_phone: parsed.toPhone,
    message_text: parsed.text,
    sender_name: parsed.senderName,
    scout_ref: scoutRef,
    lead_id: matchedLeadId ?? null,
    volunteer_id: matchedVolunteerId ?? null,
    volunteer_name: matchedVolunteerName ?? null,
    volunteer_email: matchedVolunteerEmail ?? null,
    user_input: parsed.text,
    raw_payload: parsed.raw,
    received_at: repliedAt,
  });

  return {
    saved: true,
    duplicate: false,
    inboundId,
    matchedLeadId,
    matchedVolunteerId,
    leadVerified,
    leadCreated,
    alreadyVerified,
  };
}

export function verifyWebhookSecret(
  secret: string | undefined,
  querySecret: unknown,
  headerSecret: unknown,
): boolean {
  if (!secret) return true;
  return secret === String(querySecret ?? "") || secret === String(headerSecret ?? "");
}
