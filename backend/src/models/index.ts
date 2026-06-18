import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    firebase_uid: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    full_name: { type: String, required: true },
    photo_url: { type: String, default: null },
    verified_lead_count: { type: Number, default: 0 },
    whatsapp_qr_url: { type: String, default: null },
    whatsapp_qr_generated_at: { type: Date, default: null },
    scout_ref: { type: String, unique: true, sparse: true },
    last_login_location: { type: String, default: null },
    last_login_at: { type: Date, default: null },
    created_at: { type: Date, required: true },
    updated_at: { type: Date, required: true },
  },
  { versionKey: false },
);

const leadSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    volunteer_id: { type: String, required: true, index: true },
    volunteer_name: { type: String, required: true, index: true },
    volunteer_email: { type: String, required: true, index: true },
    student_name: { type: String, required: true },
    student_phone: { type: String, required: true, unique: true },
    status: { type: String, required: true, default: "unverified" },
    verified_at: { type: Date, default: null },
    whatsapp_replied_at: { type: Date, default: null },
    whatsapp_reply_text: { type: String, default: null },
    runner_location: { type: String, default: null },
    interested_in_courses: { type: Boolean, required: true, default: true },
    neet_marks: { type: String, default: null },
    created_at: { type: Date, required: true },
  },
  { versionKey: false },
);

const walletItemSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    user_id: { type: String, required: true, index: true },
    milestone_event_id: { type: String, required: true, unique: true },
    reward_type: { type: String, required: true },
    coupon_code: { type: String, required: true },
    coupon_value: { type: String, required: true },
    status: { type: String, required: true, default: "active" },
    earned_at: { type: Date, required: true },
    milestone_number: { type: Number, required: true },
  },
  { versionKey: false },
);

const milestoneEventSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    user_id: { type: String, required: true, index: true },
    milestone_number: { type: Number, required: true },
    verified_count_at_trigger: { type: Number, required: true },
    acknowledged: { type: Boolean, default: false },
    created_at: { type: Date, required: true },
  },
  { versionKey: false },
);

milestoneEventSchema.index({ user_id: 1, milestone_number: 1 }, { unique: true });

const whatsAppInboundSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    gupshup_message_id: { type: String, default: null, index: true, sparse: true },
    from_phone: { type: String, required: true, index: true },
    to_phone: { type: String, default: null },
    message_text: { type: String, required: true },
    sender_name: { type: String, default: null },
    scout_ref: { type: String, default: null, index: true },
    lead_id: { type: String, default: null, index: true },
    volunteer_id: { type: String, default: null, index: true },
    volunteer_name: { type: String, default: null },
    volunteer_email: { type: String, default: null },
    user_input: { type: String, default: null },
    raw_payload: { type: Schema.Types.Mixed, default: null },
    received_at: { type: Date, required: true },
  },
  { versionKey: false },
);

export const UserModel = mongoose.model("User", userSchema);
export const LeadModel = mongoose.model("Lead", leadSchema);
export const WalletItemModel = mongoose.model("WalletItem", walletItemSchema);
export const MilestoneEventModel = mongoose.model("MilestoneEvent", milestoneEventSchema);

const leadOtpSessionSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    volunteer_id: { type: String, required: true, index: true },
    student_name: { type: String, required: true },
    student_phone: { type: String, required: true, index: true },
    interested_in_courses: { type: Boolean, required: true, default: true },
    neet_marks: { type: String, default: null },
    otp: { type: String, required: true },
    expires_at: { type: Date, required: true },
    last_sent_at: { type: Date, required: true },
    created_at: { type: Date, required: true },
  },
  { versionKey: false },
);

leadOtpSessionSchema.index({ volunteer_id: 1, student_phone: 1 }, { unique: true });
// MongoDB TTL — documents removed when expires_at is reached (OTP lifetime).
leadOtpSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const LeadOtpSessionModel = mongoose.model("LeadOtpSession", leadOtpSessionSchema);

export const WhatsAppInboundModel = mongoose.model(
  "WhatsAppInbound",
  whatsAppInboundSchema,
);
