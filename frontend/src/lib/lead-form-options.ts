export const COURSE_INTEREST_OPTIONS = [
  { value: "", label: "Select" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

export type CourseInterestValue = (typeof COURSE_INTEREST_OPTIONS)[number]["value"];

export const NEET_MARK_RANGE_OPTIONS = [
  { value: "", label: "Select (optional)" },
  { value: "0-100", label: "0 – 100" },
  { value: "101-200", label: "101 – 200" },
  { value: "201-300", label: "201 – 300" },
  { value: "301-400", label: "301 – 400" },
  { value: "401-500", label: "401 – 500" },
  { value: "501-600", label: "501 – 600" },
  { value: "601-720", label: "601 – 720" },
  { value: "Did not appear", label: "Did not appear" },
] as const;

export type NeetMarkRangeValue = (typeof NEET_MARK_RANGE_OPTIONS)[number]["value"];

const NEET_MARK_RANGE_SET = new Set<string>(
  NEET_MARK_RANGE_OPTIONS.map((o) => o.value).filter((v) => v !== ""),
);

export function isValidCourseInterest(value: string): value is "yes" | "no" {
  return value === "yes" || value === "no";
}

export function isValidNeetMarkRange(value: string): boolean {
  return value === "" || NEET_MARK_RANGE_SET.has(value);
}

export function getCourseInterestLabel(value: CourseInterestValue): string {
  return COURSE_INTEREST_OPTIONS.find((option) => option.value === value)?.label ?? "Select";
}

export function getNeetMarkRangeLabel(value: string): string {
  return NEET_MARK_RANGE_OPTIONS.find((option) => option.value === value)?.label ?? "Select";
}

export const COURSE_INTEREST_PICKER_OPTIONS = [
  { value: "yes" as const, label: "Yes", icon: "check" as const },
  { value: "no" as const, label: "No", icon: "close" as const },
];

export const NEET_MARK_RANGE_PICKER_OPTIONS = [
  { value: "", label: "Not applicable", icon: "dash" as const },
  ...NEET_MARK_RANGE_OPTIONS.filter((option) => option.value !== "").map((option) => ({
    value: option.value,
    label: option.label,
    icon: "chart" as const,
  })),
];
