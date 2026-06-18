import { UserModel } from "../models/index.js";
import type { ParsedLoginLocation } from "../utils/validators.js";
import {
  reverseGeocode,
  reverseGeocodeDetailed,
  type GeocodedPlace,
} from "./geocoding.service.js";

export type { GeocodedPlace };

export async function resolveLocationLabel(
  coords: ParsedLoginLocation,
): Promise<string | null> {
  if (
    coords.capture_status !== "granted" ||
    coords.latitude == null ||
    coords.longitude == null
  ) {
    return null;
  }
  return reverseGeocode(coords.latitude, coords.longitude);
}

export async function resolveRunnerLocationForLead(
  coords: ParsedLoginLocation | null,
): Promise<GeocodedPlace | null> {
  if (
    !coords ||
    coords.capture_status !== "granted" ||
    coords.latitude == null ||
    coords.longitude == null
  ) {
    return null;
  }
  return reverseGeocodeDetailed(coords.latitude, coords.longitude);
}

export async function applyUserLoginLocation(
  userId: string,
  coords: ParsedLoginLocation,
): Promise<void> {
  const now = new Date();
  const label = await resolveLocationLabel(coords);

  await UserModel.updateOne(
    { id: userId },
    {
      last_login_location: label,
      last_login_at: now,
      updated_at: now,
    },
  );
}
