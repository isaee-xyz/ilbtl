/** Client-side Indian mobile check (must match backend parseIndianMobile). */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export function isValidIndianMobileInput(digits: string): boolean {
  if (!INDIAN_MOBILE.test(digits)) return false;
  if (/^(\d)\1{9}$/.test(digits)) return false;
  return true;
}

export function indianMobileError(digits: string): string | null {
  if (digits.length === 0) return null;
  if (digits.length < 10) return "Enter a valid 10-digit number";
  if (!/^[6-9]/.test(digits)) {
    return "Indian mobile numbers must start with 6, 7, 8, or 9";
  }
  if (!isValidIndianMobileInput(digits)) {
    return "Enter a valid Indian mobile number";
  }
  return null;
}
