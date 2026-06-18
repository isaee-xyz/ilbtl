export type LoginLocationPayload =
  | {
      latitude: number;
      longitude: number;
      accuracy_m: number;
      capture_status: "granted";
    }
  | {
      latitude: null;
      longitude: null;
      accuracy_m: null;
      capture_status: "denied" | "unavailable" | "timeout" | "unsupported";
    };

const CAPTURE_LOGIN_LOCATION_KEY = "il_capture_login_location";

export function markLoginLocationCapture(source: "google" | "demo") {
  sessionStorage.setItem(CAPTURE_LOGIN_LOCATION_KEY, source);
}

export function consumeLoginLocationCapture(): "google" | "demo" | null {
  const value = sessionStorage.getItem(CAPTURE_LOGIN_LOCATION_KEY);
  sessionStorage.removeItem(CAPTURE_LOGIN_LOCATION_KEY);
  if (value === "google" || value === "demo") return value;
  return null;
}

export function getRunnerLocation(): Promise<LoginLocationPayload> {
  if (!navigator.geolocation) {
    return Promise.resolve({
      latitude: null,
      longitude: null,
      accuracy_m: null,
      capture_status: "unsupported",
    });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
          capture_status: "granted",
        });
      },
      (error) => {
        let capture_status: LoginLocationPayload["capture_status"];
        if (error.code === error.PERMISSION_DENIED) {
          capture_status = "denied";
        } else if (error.code === error.TIMEOUT) {
          capture_status = "timeout";
        } else {
          capture_status = "unavailable";
        }
        resolve({
          latitude: null,
          longitude: null,
          accuracy_m: null,
          capture_status,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  });
}
