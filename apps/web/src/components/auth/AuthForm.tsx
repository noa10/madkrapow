"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";
import { hasAnyRole, ALL_STAFF_ROLES } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Maps Supabase auth error codes to user-friendly messages
 */
function getAuthErrorMessage(error: { code?: string; message?: string }): string {
  const errorMessages: Record<string, string> = {
    invalid_credentials: "Invalid email or password",
    email_not_confirmed: "Please verify your email first",
    too_many_requests: "Too many attempts. Try again later",
    session_expired: "Your session has expired. Please sign in again",
    user_not_found: "Invalid email or password",
    invalid_grant: "Invalid email or password",
    invalid_request: "Invalid request. Please try again",
    invalid_token: "Your session has expired. Please sign in again",
    refresh_token_not_found: "Your session has expired. Please sign in again",
    bad_code_verifier: "Authentication failed. Please try again",
    conflict: "An account with this email already exists",
    email_exists: "An account with this email already exists",
    phone_exists: "An account with this phone number already exists",
    signup_disabled: "Sign up is currently disabled",
    weak_password: "Password is too weak. Please choose a stronger password",
    provider_disabled: "This sign-in method is currently disabled",
    unexpected_failure: "An unexpected error occurred. Please try again",
    // Default fallback
  };

  // Check for network errors
  if (error.message?.toLowerCase().includes("network") ||
      error.message?.toLowerCase().includes("fetch") ||
      error.message?.toLowerCase().includes("connection")) {
    return "Unable to connect. Please check your connection";
  }

  // Return mapped message or fall back to the original message or a generic one
  return errorMessages[error.code || ""] || error.message || "An unexpected error occurred";
}

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = getBrowserClient();
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(getAuthErrorMessage(error));
      }
    } catch {
      setError("Unable to connect. Please check your connection");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(getAuthErrorMessage(error));
        return;
      }

      const user = data.user ?? data.session?.user;
      const redirectPath = hasAnyRole(user, ALL_STAFF_ROLES) ? "/admin" : "/";
      router.replace(redirectPath);
      router.refresh();
    } catch {
      setError("Unable to connect. Please check your connection");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button
        variant="outline"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
      >
        <svg
          className="mr-2 h-4 w-4"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="rounded-full bg-black/55 px-3 py-1 tracking-[0.28em] text-[#d8d1c6]">
            Or continue with email
          </span>
        </div>
      </div>

      <form onSubmit={handlePasswordSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email address
          </label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="email"
            className="h-11 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/35 focus-visible:ring-[var(--gold-strong)]"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="current-password"
              className="h-11 rounded-xl border-white/10 bg-black/30 pr-10 text-white placeholder:text-white/35 focus-visible:ring-[var(--gold-strong)]"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-0 top-0 h-full px-3 py-2 text-white/60 hover:bg-transparent hover:text-white"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex justify-end">
            <a
              href="/auth/reset-password"
              className="text-sm text-primary hover:text-primary/80 hover:underline"
            >
              Forgot your password?
            </a>
          </div>
        </div>

        <Checkbox
          id="remember-me"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          label="Remember me"
        />

        {error && (
          <p
            className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="h-11 w-full rounded-xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] font-semibold uppercase tracking-[0.2em] text-black hover:brightness-105"
          disabled={isLoading}
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <a
            href="/auth/signup"
            className="text-primary hover:text-primary/80 hover:underline font-medium"
          >
            Sign up
          </a>
        </p>
      </form>
    </div>
  );
}
