export interface GeocodedPlace {
  label: string;
  city: string | null;
  state: string | null;
}

function formatNominatimAddress(address: Record<string, string>): string {
  const parts = [
    address.suburb,
    address.neighbourhood,
    address.village,
    address.city,
    address.town,
    address.county,
    address.state,
    address.country,
  ].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

function extractCityState(address: Record<string, string>): {
  city: string | null;
  state: string | null;
} {
  const city =
    address.city ||
    address.town ||
    address.county ||
    address.village ||
    address.suburb ||
    null;
  const state = address.state || null;
  return { city, state };
}

export async function reverseGeocodeDetailed(
  latitude: number,
  longitude: number,
): Promise<GeocodedPlace | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "json");
    url.searchParams.set("zoom", "14");

    const res = await fetch(url, {
      headers: { "User-Agent": "InfinityRunnerApp/1.0 (contact@infinitylearn.com)" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };

    if (data.address) {
      const label = formatNominatimAddress(data.address) || data.display_name;
      if (!label) return null;
      const { city, state } = extractCityState(data.address);
      return { label, city, state };
    }

    if (data.display_name) {
      return { label: data.display_name, city: null, state: null };
    }

    return null;
  } catch {
    return null;
  }
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const place = await reverseGeocodeDetailed(latitude, longitude);
  return place?.label ?? null;
}

/** Fallback when only the stored label string is available. */
export function parseCityStateFromLabel(location: string | null): {
  city: string;
  state: string;
} {
  if (!location?.trim()) return { city: "", state: "" };

  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      state: parts[parts.length - 2] ?? "",
      city: parts[parts.length - 3] ?? "",
    };
  }
  if (parts.length === 2) {
    return { city: parts[0] ?? "", state: parts[1] ?? "" };
  }
  return { city: parts[0] ?? "", state: "" };
}
