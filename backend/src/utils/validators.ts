/** Indian mobile: 10 digits, first digit 6–9 (TRAI numbering). */
const INDIAN_MOBILE_NATIONAL = /^[6-9]\d{9}$/;

export type IndianMobileParseResult =
  | { ok: true; phone: string }
  | { ok: false; error: string };

/**
 * Strict parser for Indian mobile numbers (+91 / 0-prefix / 10-digit national).
 * Rejects wrong lengths, invalid country codes, and non-mobile first digits.
 */
export function parseIndianMobile(input: string): IndianMobileParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a mobile number." };
  }

  if (/[a-zA-Z]/.test(trimmed)) {
    return { ok: false, error: "Mobile number must contain digits only." };
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return { ok: false, error: "Enter a valid mobile number." };
  }

  let national = digits;

  // 0 + 10-digit national trunk prefix (e.g. 09876543210)
  if (national.length === 11 && national.startsWith("0")) {
    national = national.slice(1);
  }

  // +91 / 91 country code
  if (national.length === 12 && national.startsWith("91")) {
    national = national.slice(2);
  }

  if (national.length !== 10) {
    return {
      ok: false,
      error: "Enter a valid 10-digit Indian mobile number (with or without +91).",
    };
  }

  if (!INDIAN_MOBILE_NATIONAL.test(national)) {
    return {
      ok: false,
      error: "Indian mobile numbers must start with 6, 7, 8, or 9.",
    };
  }

  // Reject obviously invalid patterns (all same digit)
  if (/^(\d)\1{9}$/.test(national)) {
    return { ok: false, error: "Enter a valid mobile number." };
  }

  return { ok: true, phone: national };
}

export function isValidIndianMobile(phone: string): boolean {
  return parseIndianMobile(phone).ok;
}

/** @deprecated Prefer parseIndianMobile — kept for call sites that already validated. */
export function normalizePhone(phone: string): string {
  const parsed = parseIndianMobile(phone);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.phone;
}

export function validateIndianMobile(phone: string): string | null {
  const parsed = parseIndianMobile(phone);
  return parsed.ok ? null : parsed.error;
}

export function validateLeadInput(name: string, phone: string): string | null {
  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) {
    return "Enter a valid student name (2–100 characters).";
  }
  return validateIndianMobile(phone);
}

export const NEET_MARK_RANGES = [
  "0-100",
  "101-200",
  "201-300",
  "301-400",
  "401-500",
  "501-600",
  "601-720",
  "Did not appear",
] as const;

export type NeetMarkRange = (typeof NEET_MARK_RANGES)[number];

const NEET_MARK_RANGE_SET = new Set<string>(NEET_MARK_RANGES);

export interface ParsedLeadExtras {
  interested_in_courses: boolean;
  neet_marks: NeetMarkRange | null;
}

function parseInterestedInCourses(raw: unknown): boolean | null {
  if (raw === true || raw === "yes") return true;
  if (raw === false || raw === "no") return false;
  return null;
}

export function parseLeadExtras(body: unknown): ParsedLeadExtras | string {
  if (body == null || typeof body !== "object") {
    return "Invalid request body.";
  }

  const raw = body as Record<string, unknown>;
  const interested = parseInterestedInCourses(raw.interested_in_courses);
  if (interested == null) {
    return "Please select Yes or No for Infinity Learn course interest.";
  }

  const neetRaw = raw.neet_marks;
  if (neetRaw == null || neetRaw === "") {
    return { interested_in_courses: interested, neet_marks: null };
  }

  const range = String(neetRaw).trim();
  if (!NEET_MARK_RANGE_SET.has(range)) {
    return "Select a valid NEET marks range.";
  }

  return { interested_in_courses: interested, neet_marks: range as NeetMarkRange };
}

export type LoginLocationCaptureStatus =
  | "granted"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported";

export interface ParsedLoginLocation {
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  capture_status: LoginLocationCaptureStatus;
}

const CAPTURE_STATUSES = new Set<LoginLocationCaptureStatus>([
  "granted",
  "denied",
  "unavailable",
  "timeout",
  "unsupported",
]);

export function parseLoginLocationBody(
  body: unknown,
): ParsedLoginLocation | null | string {
  if (body == null || typeof body !== "object") return null;

  const raw = body as Record<string, unknown>;
  const capture_status = raw.capture_status;
  if (capture_status == null || capture_status === "") return null;
  if (typeof capture_status !== "string" || !CAPTURE_STATUSES.has(capture_status as LoginLocationCaptureStatus)) {
    return "Invalid capture_status.";
  }

  if (capture_status === "granted") {
    const latitude = raw.latitude;
    const longitude = raw.longitude;
    const accuracy_m = raw.accuracy_m;

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      typeof accuracy_m !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(accuracy_m)
    ) {
      return "Granted location requires latitude, longitude, and accuracy_m.";
    }
    if (latitude < -90 || latitude > 90) {
      return "latitude must be between -90 and 90.";
    }
    if (longitude < -180 || longitude > 180) {
      return "longitude must be between -180 and 180.";
    }
    if (accuracy_m < 0) {
      return "accuracy_m must be non-negative.";
    }

    return {
      latitude,
      longitude,
      accuracy_m,
      capture_status: "granted",
    };
  }

  return {
    latitude: null,
    longitude: null,
    accuracy_m: null,
    capture_status: capture_status as Exclude<LoginLocationCaptureStatus, "granted">,
  };
}
