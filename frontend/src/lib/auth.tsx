import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getMe, syncUser } from "./api";
import {
  consumeLoginLocationCapture,
  getRunnerLocation,
  markLoginLocationCapture,
} from "./geolocation";
import {
  getFirebaseAuth,
  googleProvider,
  isFirebaseConfigured,
} from "./firebase";
import type { LeadSummary, UserRecord } from "./types";

interface AuthState {
  firebaseUser: User | null;
  user: UserRecord | null;
  summary: LeadSummary;
  loading: boolean;
  redirectPending: boolean;
  authError: string | null;
  token: string | null;
  isDemo: boolean;
  signInWithGoogle: () => Promise<void>;
  signInDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  clearAuthError: () => void;
}

const defaultSummary: LeadSummary = { verified: 0, unverified: 0, total: 0 };
const AuthContext = createContext<AuthState | null>(null);
const DEMO_STORAGE_KEY = "infinity_runner_demo";
const REDIRECT_PENDING_KEY = "infinity_runner_google_redirect";

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function formatFirebaseError(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: string }).code)
      : "";
  const message = error instanceof Error ? error.message : "Sign-in failed.";

  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Sign-in was cancelled. Please try again.";
  }
  if (code === "auth/popup-blocked") {
    return "Pop-up was blocked. Allow pop-ups or try again.";
  }
  if (code === "auth/account-exists-with-different-credential") {
    return "This email is linked to another sign-in method. Use the original account.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error during sign-in. Check your connection and try again.";
  }
  return message;
}

function isPopupBlockedError(error: unknown): boolean {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: string }).code)
      : "";
  return (
    code === "auth/popup-blocked" ||
    code === "auth/operation-not-supported-in-this-environment"
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<UserRecord | null>(null);
  const [summary, setSummary] = useState<LeadSummary>(defaultSummary);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirectPending, setRedirectPending] = useState(
    () => sessionStorage.getItem(REDIRECT_PENDING_KEY) === "1",
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const syncSession = useCallback(async (idToken: string) => {
    const captureSource = consumeLoginLocationCapture();
    const location =
      captureSource === "google" ? await getRunnerLocation() : undefined;
    const data = await syncUser(idToken, location);
    setUser(data.user);
    setSummary(data.summary);
    setToken(idToken);
    setIsDemo(false);
    setAuthError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (isDemo && user) {
      const res = await fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer demo:${user.firebase_uid}` },
      });
      const data = await res.json();
      if (res.ok) setSummary(data.summary);
      return;
    }
    if (!isFirebaseConfigured()) return;
    const auth = getFirebaseAuth();
    if (!auth.currentUser) return;
    const idToken = await auth.currentUser.getIdToken();
    const data = await getMe(idToken);
    setUser(data.user);
    setSummary(data.summary);
    setToken(idToken);
  }, [isDemo, user]);

  useEffect(() => {
    async function restoreDemo() {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw) as {
          user: UserRecord;
          summary: LeadSummary;
        };
        setUser(parsed.user);
        setSummary(parsed.summary);
        setToken(`demo:${parsed.user.firebase_uid}`);
        setIsDemo(true);
        return true;
      } catch {
        localStorage.removeItem(DEMO_STORAGE_KEY);
        return false;
      }
    }

    if (!isFirebaseConfigured()) {
      restoreDemo().finally(() => setLoading(false));
      return;
    }

    const auth = getFirebaseAuth();
    let unsub = () => {};

    async function init() {
      if (sessionStorage.getItem(REDIRECT_PENDING_KEY) === "1") {
        setRedirectPending(true);
      }

      try {
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult?.user) {
          const idToken = await redirectResult.user.getIdToken();
          await syncSession(idToken);
        }
      } catch (error) {
        setAuthError(formatFirebaseError(error));
      } finally {
        sessionStorage.removeItem(REDIRECT_PENDING_KEY);
        setRedirectPending(false);
      }

      unsub = onAuthStateChanged(auth, async (fbUser) => {
        setFirebaseUser(fbUser);
        if (fbUser) {
          try {
            const idToken = await fbUser.getIdToken();
            await syncSession(idToken);
          } catch (error) {
            setAuthError(
              error instanceof Error ? error.message : "Could not complete sign-in.",
            );
            setUser(null);
            setToken(null);
          }
        } else {
          const restored = await restoreDemo();
          if (!restored) {
            setUser(null);
            setToken(null);
            setSummary(defaultSummary);
          }
        }
        setLoading(false);
      });
    }

    init();
    return () => unsub();
  }, [syncSession]);

  const signInWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      throw new Error("Configure Firebase env vars in .env first.");
    }
    const auth = getFirebaseAuth();
    setAuthError(null);
    markLoginLocationCapture("google");

    const startRedirect = async () => {
      sessionStorage.setItem(REDIRECT_PENDING_KEY, "1");
      await signInWithRedirect(auth, googleProvider);
    };

    if (!isMobile()) {
      await signInWithPopup(auth, googleProvider);
      return;
    }

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      if (isPopupBlockedError(error)) {
        await startRedirect();
        return;
      }
      throw error;
    }
  }, []);

  const signInDemo = useCallback(async () => {
    const location = await getRunnerLocation();
    const res = await fetch("/api/v1/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(location),
    });
    const text = await res.text();
    let data: { user?: UserRecord; summary?: LeadSummary; error?: string };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      throw new Error(
        res.status === 404
          ? "API not found — check the backend is running and /api is reachable"
          : "Demo sign-in failed",
      );
    }
    if (!res.ok) throw new Error(data.error ?? "Demo sign-in failed");
    if (!data.user || !data.summary) {
      throw new Error("Demo sign-in returned an invalid response");
    }
    localStorage.setItem(
      DEMO_STORAGE_KEY,
      JSON.stringify({ user: data.user, summary: data.summary }),
    );
    setUser(data.user);
    setSummary(data.summary);
    setToken(`demo:${data.user.firebase_uid}`);
    setIsDemo(true);
    setFirebaseUser(null);
    setAuthError(null);
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(DEMO_STORAGE_KEY);
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
    setUser(null);
    setToken(null);
    setSummary(defaultSummary);
    setIsDemo(false);
    setAuthError(null);
    if (isFirebaseConfigured()) {
      await firebaseSignOut(getFirebaseAuth());
    }
  }, []);

  const value = useMemo(
    () => ({
      firebaseUser,
      user,
      summary,
      loading,
      redirectPending,
      authError,
      token,
      isDemo,
      signInWithGoogle,
      signInDemo,
      signOut,
      refresh,
      clearAuthError,
    }),
    [
      firebaseUser,
      user,
      summary,
      loading,
      redirectPending,
      authError,
      token,
      isDemo,
      signInWithGoogle,
      signInDemo,
      signOut,
      refresh,
      clearAuthError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function formatAuthError(message: string): string {
  if (message.includes("popup-closed-by-user")) {
    return "Sign-in was cancelled. Please try again.";
  }
  return message;
}
