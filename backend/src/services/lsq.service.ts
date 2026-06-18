import { parseCityStateFromLabel } from "./geocoding.service.js";

export interface LsqLeadInput {
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
}

export interface LsqPushResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  response?: string;
}

interface LsqCreateCustomBody {
  LeadDetails: { Attribute: string; Value: string }[];
  Activity: {
    ActivityEvent: number;
    ActivityNote: string;
    Fields: { SchemaName: string; Value: string }[];
  };
}

function isLsqConfigured(): boolean {
  return (
    process.env.LSQ_ENABLED === "true" &&
    Boolean(process.env.LSQ_ACCESS_KEY?.trim()) &&
    Boolean(process.env.LSQ_SECRET_KEY?.trim())
  );
}

function lsqConfig(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

/** LSQ expects `YYYY-MM-DD HH:mm:ss` (India time). */
function formatLsqConsentDateTime(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace("T", " ");
}

function buildLsqPayload(lead: LsqLeadInput): LsqCreateCustomBody {
  const phone =
    lead.student_phone.length === 10
      ? lead.student_phone
      : lead.student_phone.replace(/\D/g, "").slice(-10);

  const city =
    lead.runner_city?.trim() ||
    parseCityStateFromLabel(lead.runner_location).city;
  const state =
    lead.runner_state?.trim() ||
    parseCityStateFromLabel(lead.runner_location).state;

  const leadDetails: { Attribute: string; Value: string }[] = [
    { Attribute: "Phone", Value: phone },
    { Attribute: "SearchBy", Value: "Phone" },
    { Attribute: "SourceMedium", Value: lsqConfig("LSQ_SOURCE_MEDIUM", "Whatsapp") },
    { Attribute: "Source", Value: lsqConfig("LSQ_SOURCE", "Brand Lead") },
    { Attribute: "FirstName", Value: lead.student_name },
    { Attribute: "mx_Grade", Value: lsqConfig("LSQ_MX_GRADE", "12") },
    {
      Attribute: "mx_Primary_Target_Exam",
      Value: lsqConfig("LSQ_MX_PRIMARY_TARGET_EXAM", "NEET"),
    },
    {
      Attribute: "mx_Last_Consent_Date",
      Value: formatLsqConsentDateTime(),
    },
    { Attribute: "mx_State", Value: state || "Unknown" },
    { Attribute: "mx_City", Value: city || "Unknown" },
    {
      Attribute: "SourceCampaign",
      Value: lsqConfig("LSQ_SOURCE_CAMPAIGN", "Re NEET 2026"),
    },
    {
      Attribute: "SourceContent",
      Value: lsqConfig("LSQ_SOURCE_CONTENT", "Re NEET 2026"),
    },
    { Attribute: "mx_User_Type", Value: lsqConfig("LSQ_MX_USER_TYPE", "Parent") },
  ];

  if (lead.neet_marks != null && lead.neet_marks !== "") {
    leadDetails.push({
      Attribute: lsqConfig("LSQ_ATTR_NEET_MARKS", "mx_NEET_Marks"),
      Value: lead.neet_marks,
    });
  }

  leadDetails.push({
    Attribute: lsqConfig("LSQ_ATTR_INTERESTED", "mx_Interested_In_IL_Courses"),
    Value: lead.interested_in_courses ? "Yes" : "No",
  });

  leadDetails.push({
    Attribute: lsqConfig("LSQ_ATTR_VERIFIED", "mx_Lead_Verified"),
    Value: lead.status === "verified" ? "Yes" : "No",
  });

  return {
    LeadDetails: leadDetails,
    Activity: {
      ActivityEvent: Number(lsqConfig("LSQ_ACTIVITY_EVENT", "203")),
      ActivityNote: lsqConfig("LSQ_ACTIVITY_NOTE", "Re NEET 2026"),
      Fields: [
        {
          SchemaName: lsqConfig("LSQ_ACTIVITY_FIELD_WHATSAPP_NAME", "mx_Custom_5"),
          Value: lead.student_name,
        },
        {
          SchemaName: lsqConfig("LSQ_ACTIVITY_FIELD_RUNNER_EMAIL", "mx_Custom_4"),
          Value: lead.volunteer_email,
        },
      ],
    },
  };
}

/**
 * Push lead to LeadSquared via ProspectActivity.svc/CreateCustom.
 * Lead save succeeds even if LSQ push fails.
 */
export async function pushLeadToLsq(lead: LsqLeadInput): Promise<LsqPushResult> {
  if (!isLsqConfigured()) {
    return { ok: false, skipped: true };
  }

  const accessKey = process.env.LSQ_ACCESS_KEY!.trim();
  const secretKey = process.env.LSQ_SECRET_KEY!.trim();
  const host = process.env.LSQ_API_HOST?.trim() || "api-in21.leadsquared.com";
  const path =
    process.env.LSQ_API_PATH?.trim() ||
    "/v2/ProspectActivity.svc/CreateCustom";

  const url = `https://${host}${path}`;
  const body = buildLsqPayload(lead);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-LSQ-AccessKey": accessKey,
        "x-LSQ-SecretKey": secretKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("[LSQ] push failed:", res.status, text);
      return { ok: false, error: text || `HTTP ${res.status}` };
    }

    return { ok: true, response: text };
  } catch (error) {
    const message = error instanceof Error ? error.message : "LSQ request failed";
    console.error("[LSQ] push error:", message);
    return { ok: false, error: message };
  }
}
