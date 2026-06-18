import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthGuard } from "@/components/AuthGuard";
import { MobileHomeHeader } from "@/components/MobileHomeHeader";
import { SplitPanelLayout } from "@/components/SplitPanelLayout";
import { SuccessScreen } from "@/components/SuccessScreen";
import { resendLeadOtp, savePendingLead, sendLeadOtp, verifyLeadOtp } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getRunnerLocation } from "@/lib/geolocation";
import { indianMobileError, isValidIndianMobileInput } from "@/lib/phone";
import {
  COURSE_INTEREST_PICKER_OPTIONS,
  NEET_MARK_RANGE_PICKER_OPTIONS,
  type CourseInterestValue,
  getCourseInterestLabel,
  getNeetMarkRangeLabel,
  isValidCourseInterest,
} from "@/lib/lead-form-options";
import { OptionPickerField } from "@/components/SheetOptionPicker";

interface AddLeadFormProps {
  name: string;
  phone: string;
  interestedInCourses: CourseInterestValue;
  neetMarks: string;
  error: string | null;
  formId: string;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onInterestedChange: (value: CourseInterestValue) => void;
  onNeetMarksChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
}

function AddLeadForm({
  name,
  phone,
  interestedInCourses,
  neetMarks,
  error,
  formId,
  onNameChange,
  onPhoneChange,
  onInterestedChange,
  onNeetMarksChange,
  onSubmit,
}: AddLeadFormProps) {
  return (
    <form id={formId} onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor={`${formId}-name`} className="mb-1.5 block text-sm font-medium">
          Student name *
        </label>
        <input
          id={`${formId}-name`}
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Full name"
          autoFocus
          required
          className="w-full rounded-xl border border-il-neutral-90 bg-il-bg-grey-tint px-4 py-3.5 outline-none focus:border-il-blue-30 focus:ring-2 focus:ring-il-blue-90"
        />
      </div>

      <div>
        <label htmlFor={`${formId}-phone`} className="mb-1.5 block text-sm font-medium">
          Phone number *
        </label>
        <div className="flex overflow-hidden rounded-xl border border-il-neutral-90 bg-il-bg-grey-tint focus-within:border-il-blue-30 focus-within:ring-2 focus-within:ring-il-blue-90">
          <span className="flex items-center border-r border-il-neutral-90 px-3 text-sm text-il-text-secondary">
            +91
          </span>
          <input
            id={`${formId}-phone`}
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="10-digit mobile"
            required
            maxLength={10}
            className="w-full bg-transparent px-4 py-3.5 outline-none"
          />
        </div>
        {indianMobileError(phone) && (
          <p className="mt-1.5 text-xs text-il-error">{indianMobileError(phone)}</p>
        )}
        <p className="mt-2 text-xs text-il-neutral-50">
          We&apos;ll send a 6-digit OTP on WhatsApp. Valid for 5 minutes.
        </p>
      </div>

      <OptionPickerField
        id={`${formId}-neet`}
        label="Previous NEET marks (optional)"
        value={neetMarks}
        placeholder="Select (optional)"
        displayValue={getNeetMarkRangeLabel(neetMarks)}
        options={NEET_MARK_RANGE_PICKER_OPTIONS}
        onChange={onNeetMarksChange}
        hint='Choose "Not applicable" if marks are unknown'
      />

      <OptionPickerField
        id={`${formId}-interested`}
        label="Interested to join Infinity Learn courses *"
        value={interestedInCourses}
        placeholder="Select"
        displayValue={getCourseInterestLabel(interestedInCourses)}
        options={COURSE_INTEREST_PICKER_OPTIONS}
        onChange={onInterestedChange}
        required
      />

      {error && <p className="text-sm text-il-error">{error}</p>}
    </form>
  );
}

type Step = "details" | "otp" | "success";
type SuccessMode = "verified" | "pending";

function OtpVerificationForm({
  phone,
  maskedPhone,
  otp,
  error,
  resendSeconds,
  loading,
  formId,
  onOtpChange,
  onSubmit,
  onResend,
}: {
  phone: string;
  maskedPhone: string;
  otp: string;
  error: string | null;
  resendSeconds: number;
  loading: boolean;
  formId: string;
  onOtpChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onResend: () => void;
}) {
  return (
    <form id={formId} onSubmit={onSubmit} className="space-y-5">
      <div className="rounded-xl bg-il-blue-95 px-4 py-3 text-sm text-il-blue-30">
        OTP sent on WhatsApp to{" "}
        <span className="font-semibold">{maskedPhone || `+91 ${phone}`}</span>
      </div>

      <div>
        <label htmlFor={`${formId}-otp`} className="mb-1.5 block text-sm font-medium">
          Enter 6-digit OTP *
        </label>
        <input
          id={`${formId}-otp`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={otp}
          onChange={(e) => onOtpChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="• • • • • •"
          maxLength={6}
          autoFocus
          className="w-full rounded-xl border border-il-neutral-90 bg-il-bg-grey-tint px-4 py-3.5 text-center text-2xl font-bold tracking-[0.35em] outline-none focus:border-il-blue-30 focus:ring-2 focus:ring-il-blue-90"
        />
        <p className="mt-2 text-xs text-il-neutral-50">
          OTP expires in 5 minutes. Verify with OTP, or save as pending if it didn&apos;t arrive.
        </p>
      </div>

      {error && <p className="text-sm text-il-error">{error}</p>}

      <button
        type="button"
        onClick={onResend}
        disabled={loading || resendSeconds > 0}
        className="text-sm font-semibold text-il-blue-30 disabled:cursor-not-allowed disabled:text-il-neutral-50"
      >
        {resendSeconds > 0
          ? `Resend OTP in ${resendSeconds}s`
          : "Resend OTP on WhatsApp"}
      </button>
    </form>
  );
}

function MobileSuccessCard({
  savedName,
  successMode,
  onAddAnother,
}: {
  savedName: string;
  successMode: SuccessMode;
  onAddAnother: () => void;
}) {
  const navigate = useNavigate();
  const isVerified = successMode === "verified";

  return (
    <div className="il-mobile-login-bg flex min-h-screen flex-col px-4 pb-8 pt-14 lg:hidden">
      <MobileHomeHeader title="Add Lead" onBack={() => navigate("/leads")} />

      <div className="rounded-[20px] bg-white px-6 py-10 shadow-[0_4px_20px_rgba(1,47,99,0.12)]">
        <div className="flex flex-col items-center text-center">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-elevated ${
              isVerified ? "bg-il-success-50" : "bg-il-blue-30"
            }`}
          >
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-6 text-xl font-bold text-il-neutral-10">
            {isVerified ? "Lead verified!" : "Lead saved!"}
          </h2>
          <p className="mt-2 max-w-xs text-sm text-il-neutral-50">
            {isVerified
              ? `${savedName} is added as a verified lead after WhatsApp OTP confirmation.`
              : `${savedName} is saved as pending verification. You can verify later from Pending Leads.`}
          </p>
          <div className="mt-8 flex w-full flex-col gap-3">
            <button
              type="button"
              onClick={onAddAnother}
              className="w-full rounded-full bg-il-blue-30 py-3.5 text-sm font-semibold text-white hover:bg-il-blue-20"
            >
              Add another lead
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="w-full rounded-full border border-il-neutral-90 py-3.5 text-sm font-semibold text-il-neutral-50 hover:bg-il-bg-grey-tint"
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddLeadContent() {
  const { token, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [interestedInCourses, setInterestedInCourses] = useState<CourseInterestValue>("");
  const [neetMarks, setNeetMarks] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [successMode, setSuccessMode] = useState<SuccessMode>("verified");
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setResendSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  function resetFlow() {
    setStep("details");
    setName("");
    setPhone("");
    setInterestedInCourses("");
    setNeetMarks("");
    setMaskedPhone("");
    setOtp("");
    setError(null);
    setSavedName(null);
    setSuccessMode("verified");
    setResendSeconds(0);
  }

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const neet = neetMarks.trim() === "" ? null : neetMarks.trim();
      const result = await sendLeadOtp(
        token,
        name.trim(),
        phone,
        interestedInCourses === "yes",
        neet,
      );
      setMaskedPhone(result.masked_phone);
      setResendSeconds(result.resend_available_in_seconds);
      setOtp("");
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (!token || resendSeconds > 0) return;
    setError(null);
    setLoading(true);
    try {
      const result = await resendLeadOtp(token, phone);
      setResendSeconds(result.resend_available_in_seconds);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not resend OTP";
      setError(message);
      if (
        err instanceof Error &&
        "retryAfterSeconds" in err &&
        typeof (err as Error & { retryAfterSeconds?: number }).retryAfterSeconds ===
          "number"
      ) {
        setResendSeconds(
          (err as Error & { retryAfterSeconds: number }).retryAfterSeconds,
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const location = await getRunnerLocation();
      await verifyLeadOtp(token, phone, otp, location);
      setSavedName(name.trim());
      setSuccessMode("verified");
      setStep("success");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid OTP");
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePending() {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const location = await getRunnerLocation();
      await savePendingLead(token, phone, location);
      setSavedName(name.trim());
      setSuccessMode("pending");
      setStep("success");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save lead");
    } finally {
      setLoading(false);
    }
  }

  if (step === "success" && savedName) {
    const isVerified = successMode === "verified";
    return (
      <>
        <MobileSuccessCard
          savedName={savedName}
          successMode={successMode}
          onAddAnother={resetFlow}
        />
        <div className="hidden lg:block">
          <SplitPanelLayout>
            <SuccessScreen
              title={isVerified ? "Lead verified!" : "Lead saved!"}
              message={
                isVerified
                  ? `${savedName} is added as a verified lead after WhatsApp OTP confirmation.`
                  : `${savedName} is saved as pending verification. You can verify later from Pending Leads.`
              }
              primaryLabel="Add another lead"
              primaryTo="/leads/new"
              onPrimaryClick={resetFlow}
              secondaryLabel="Back to home"
              secondaryTo="/dashboard"
            />
          </SplitPanelLayout>
        </div>
      </>
    );
  }

  const mobileTitle = step === "otp" ? "Verify OTP" : "Add Lead";
  const detailsFormValid =
    Boolean(name.trim()) &&
    isValidIndianMobileInput(phone) &&
    isValidCourseInterest(interestedInCourses);
  const mobileSubmitLabel =
    step === "otp"
      ? loading
        ? "Verifying…"
        : "Verify & save lead"
      : loading
        ? "Sending OTP…"
        : "Send OTP on WhatsApp";

  return (
    <>
      <div className="il-mobile-login-bg flex min-h-screen flex-col px-4 pb-36 pt-14 lg:hidden">
        <MobileHomeHeader
          title={mobileTitle}
          onBack={() => (step === "otp" ? setStep("details") : navigate(-1))}
        />

        <div className="rounded-[20px] bg-white px-5 py-6 shadow-[0_4px_20px_rgba(1,47,99,0.12)]">
          <h1 className="text-xl font-bold text-il-neutral-10">{mobileTitle}</h1>
          <p className="mt-1.5 text-sm text-il-neutral-50">
            {step === "otp"
              ? "Enter the OTP sent to the student's WhatsApp."
              : "Enter student details to send OTP on WhatsApp."}
          </p>

          <div className="mt-6">
            {step === "details" ? (
              <AddLeadForm
                formId="add-lead-mobile"
                name={name}
                phone={phone}
                interestedInCourses={interestedInCourses}
                neetMarks={neetMarks}
                error={error}
                onNameChange={setName}
                onPhoneChange={setPhone}
                onInterestedChange={setInterestedInCourses}
                onNeetMarksChange={setNeetMarks}
                onSubmit={handleSendOtp}
              />
            ) : (
              <OtpVerificationForm
                formId="add-lead-otp-mobile"
                phone={phone}
                maskedPhone={maskedPhone}
                otp={otp}
                error={error}
                resendSeconds={resendSeconds}
                loading={loading}
                onOtpChange={setOtp}
                onSubmit={handleVerifyOtp}
                onResend={handleResendOtp}
              />
            )}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 space-y-2 px-4 pb-6 pt-3 lg:hidden">
          <button
            type="submit"
            form={step === "details" ? "add-lead-mobile" : "add-lead-otp-mobile"}
            disabled={
              loading ||
              (step === "details"
                ? !detailsFormValid
                : otp.length < 6)
            }
            className="w-full rounded-full bg-white py-4 text-sm font-semibold text-il-blue-30 shadow-[0_8px_32px_rgba(0,0,0,0.2)] disabled:opacity-50"
          >
            {mobileSubmitLabel}
          </button>
          {step === "otp" && (
            <button
              type="button"
              onClick={handleSavePending}
              disabled={loading}
              className="w-full rounded-full border border-white/40 bg-white/10 py-3.5 text-sm font-semibold text-white backdrop-blur-sm disabled:opacity-50"
            >
              {loading ? "Saving…" : "OTP didn't arrive? Save lead (pending)"}
            </button>
          )}
        </div>
      </div>

      <div className="hidden lg:block">
        <SplitPanelLayout>
          <div className="flex flex-1 flex-col">
            <div className="flex-1 px-5 py-8 sm:px-10">
              <button
                type="button"
                onClick={() => (step === "otp" ? setStep("details") : navigate(-1))}
                className="mb-6 text-sm font-medium text-il-blue-30"
              >
                ← Back
              </button>

              <h1 className="text-2xl font-bold text-il-text-primary">{mobileTitle}</h1>
              <p className="mt-2 text-sm text-il-text-secondary">
                {step === "otp"
                  ? "Enter the OTP sent to the student's WhatsApp."
                  : "Enter student details to send OTP on WhatsApp."}
              </p>

              <div className="mt-8">
                {step === "details" ? (
                  <AddLeadForm
                    formId="add-lead-desktop"
                    name={name}
                    phone={phone}
                    interestedInCourses={interestedInCourses}
                    neetMarks={neetMarks}
                    error={error}
                    onNameChange={setName}
                    onPhoneChange={setPhone}
                    onInterestedChange={setInterestedInCourses}
                    onNeetMarksChange={setNeetMarks}
                    onSubmit={handleSendOtp}
                  />
                ) : (
                  <OtpVerificationForm
                    formId="add-lead-otp-desktop"
                    phone={phone}
                    maskedPhone={maskedPhone}
                    otp={otp}
                    error={error}
                    resendSeconds={resendSeconds}
                    loading={loading}
                    onOtpChange={setOtp}
                    onSubmit={handleVerifyOtp}
                    onResend={handleResendOtp}
                  />
                )}
              </div>
            </div>

            <div className="border-t border-il-neutral-90 bg-white px-5 py-4 sm:px-10">
              <div className="space-y-2">
                <button
                  type="submit"
                  form={step === "details" ? "add-lead-desktop" : "add-lead-otp-desktop"}
                  disabled={
                    loading ||
                    (step === "details"
                      ? !detailsFormValid
                      : otp.length < 6)
                  }
                  className="w-full rounded-xl bg-il-blue-30 py-4 text-sm font-semibold text-white hover:bg-il-blue-20 disabled:opacity-50"
                >
                  {mobileSubmitLabel}
                </button>
                {step === "otp" && (
                  <button
                    type="button"
                    onClick={handleSavePending}
                    disabled={loading}
                    className="w-full rounded-xl border border-il-neutral-90 py-3.5 text-sm font-semibold text-il-neutral-50 hover:bg-il-bg-grey-tint disabled:opacity-50"
                  >
                    {loading ? "Saving…" : "OTP didn't arrive? Save lead (pending verification)"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </SplitPanelLayout>
      </div>
    </>
  );
}

export function AddLeadPage() {
  return (
    <AuthGuard>
      <AddLeadContent />
    </AuthGuard>
  );
}
