import type {
  LeadRecord,
  LeadSummary,
  PendingMilestone,
  UserRecord,
  WalletItem,
  WhatsAppQrInfo,
} from "./types";
import type { LoginLocationPayload } from "./geolocation";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
  /\/$/,
  "",
) ?? "";

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string }).error ?? "Request failed",
    ) as Error & { retryAfterSeconds?: number };
    if (typeof (data as { retry_after_seconds?: number }).retry_after_seconds === "number") {
      err.retryAfterSeconds = (data as { retry_after_seconds: number }).retry_after_seconds;
    }
    throw err;
  }
  return data as T;
}

export const syncUser = (token: string, location?: LoginLocationPayload) =>
  apiFetch<{ user: UserRecord; summary: LeadSummary }>("/api/v1/auth/sync", {
    method: "POST",
    token,
    body: location ? JSON.stringify(location) : undefined,
  });

export const getMe = (token: string) =>
  apiFetch<{ user: UserRecord; summary: LeadSummary }>("/api/v1/auth/me", {
    token,
  });

export const getLeads = (token: string) =>
  apiFetch<{ leads: LeadRecord[] }>("/api/v1/leads", { token });

export interface LeadOtpSendResult {
  ok: boolean;
  otp_sent: boolean;
  expires_in_seconds: number;
  resend_available_in_seconds: number;
  masked_phone: string;
}

export const sendLeadOtp = (
  token: string,
  student_name: string,
  student_phone: string,
  interested_in_courses: boolean,
  neet_marks?: string | null,
) =>
  apiFetch<LeadOtpSendResult>("/api/v1/leads/otp/send", {
    method: "POST",
    token,
    body: JSON.stringify({
      student_name,
      student_phone,
      interested_in_courses,
      neet_marks: neet_marks ?? null,
    }),
  });

export const resendLeadOtp = (token: string, student_phone: string) =>
  apiFetch<Omit<LeadOtpSendResult, "masked_phone">>("/api/v1/leads/otp/resend", {
    method: "POST",
    token,
    body: JSON.stringify({ student_phone }),
  });

export const verifyLeadOtp = (
  token: string,
  student_phone: string,
  otp: string,
  location?: LoginLocationPayload,
) =>
  apiFetch<{
    id: string;
    status: string;
    summary: LeadSummary;
    verified: boolean;
  }>("/api/v1/leads/otp/verify", {
    method: "POST",
    token,
    body: JSON.stringify({ student_phone, otp, ...location }),
  });

export const savePendingLead = (
  token: string,
  student_phone: string,
  location?: LoginLocationPayload,
) =>
  apiFetch<{
    id: string;
    status: string;
    summary: LeadSummary;
    verified: boolean;
  }>("/api/v1/leads/pending", {
    method: "POST",
    token,
    body: JSON.stringify({ student_phone, ...location }),
  });

/** @deprecated Use sendLeadOtp + verifyLeadOtp */
export const createLead = (
  token: string,
  student_name: string,
  student_phone: string,
) =>
  apiFetch<{ id: string; status: string; summary: LeadSummary; message_sent?: boolean }>(
    "/api/v1/leads",
    {
      method: "POST",
      token,
      body: JSON.stringify({ student_name, student_phone }),
    },
  );

export const getWallet = (token: string) =>
  apiFetch<{ items: WalletItem[] }>("/api/v1/wallet", { token });

export const getPendingMilestone = (token: string) =>
  apiFetch<{ has_pending: boolean; milestone: PendingMilestone | null }>(
    "/api/v1/milestones/pending",
    { token },
  );

export const acknowledgeMilestone = (token: string, id: string) =>
  apiFetch<{ ok: boolean }>(`/api/v1/milestones/${id}/acknowledge`, {
    method: "POST",
    token,
  });

export const getWhatsAppQr = (token: string) =>
  apiFetch<WhatsAppQrInfo>("/api/v1/profile/whatsapp-qr", { token });

export const generateWhatsAppQr = (token: string) =>
  apiFetch<WhatsAppQrInfo>("/api/v1/profile/whatsapp-qr", {
    method: "POST",
    token,
  });
