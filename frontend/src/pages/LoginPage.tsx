import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLoaderScreen } from "@/components/AuthLoaderScreen";
import { InfinityLearnLogo } from "@/components/InfinityLearnLogo";
import { LoginForm } from "@/components/LoginForm";
import { formatAuthError, useAuth } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";

export function LoginPage() {
  const {
    user,
    loading,
    redirectPending,
    authError,
    clearAuthError,
    signInWithGoogle,
    signInDemo,
  } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(true);
  const firebaseReady = isFirebaseConfigured();

  useEffect(() => {
    if (!loading && user) navigate("/loading", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (authError) {
      setError(authError);
      clearAuthError();
      setGoogleLoading(false);
    }
  }, [authError, clearAuthError]);

  const canSignIn = agreedTerms && !googleLoading && !demoLoading;

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(formatAuthError(e instanceof Error ? e.message : "Sign-in failed."));
      setGoogleLoading(false);
    }
  }

  async function handleDemoSignIn() {
    setError(null);
    setDemoLoading(true);
    try {
      await signInDemo();
      navigate("/loading", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo sign-in failed");
      setDemoLoading(false);
    }
  }

  const formProps = {
    firebaseReady,
    agreedTerms,
    onAgreedTermsChange: setAgreedTerms,
    error,
    canSignIn,
    googleLoading,
    demoLoading,
    onGoogleSignIn: handleGoogleSignIn,
    onDemoSignIn: handleDemoSignIn,
  };

  if (loading || user || googleLoading || redirectPending) {
    return <AuthLoaderScreen />;
  }

  return (
    <>
      {/* Mobile — fixed viewport, no page scroll */}
      <div className="il-mobile-login-bg flex h-dvh flex-col overflow-hidden lg:hidden">
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <InfinityLearnLogo variant="on-blue" size="lg" className="[&_img]:h-32" />
          <p className="mt-2 text-center text-[13px] tracking-wide text-il-blue-90">
            Where learning never stops
          </p>
        </div>

        <div className="w-full shrink-0">
          <div className="mx-auto w-full max-w-[412px] rounded-t-[24px] bg-white px-4 pb-8 pt-8">
            <LoginForm
              variant="mobile"
              title="Volunteer Login"
              subtitle="Sign in with your Google account to collect leads and earn rewards"
              {...formProps}
            />
          </div>
        </div>
      </div>

      {/* Desktop / web */}
      <div className="hidden min-h-screen lg:flex">
        <aside className="il-login-web-brand relative flex w-1/2 items-center justify-center overflow-hidden">
          <div className="relative z-10 flex flex-col items-center px-12 text-center">
            <InfinityLearnLogo
              variant="on-blue"
              size="lg"
              className="[&_img]:h-[180px] xl:[&_img]:h-[200px]"
            />
            <p className="mt-6 text-sm tracking-wide text-white/90">
              Where learning never stops
            </p>
            <p className="mt-2 text-xs text-white/75">Power up your learning journey</p>
          </div>
        </aside>

        <main className="flex w-1/2 flex-col bg-white">
          <div className="flex flex-1 items-center justify-center px-10 xl:px-[121px]">
            <LoginForm
              variant="web"
              title="Welcome"
              subtitle="Sign in with your Google account or choose demo mode to continue as a volunteer."
              {...formProps}
            />
          </div>
        </main>
      </div>
    </>
  );
}
