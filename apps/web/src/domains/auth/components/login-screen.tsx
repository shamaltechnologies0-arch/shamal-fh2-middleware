import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AppLogo } from "@/components/layout/app-logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginScreenProps = {
  isAdmin?: boolean;
  onSubmit: (username: string, password: string) => Promise<string | null>;
};

export function LoginScreen({ isAdmin = false, onSubmit }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const message = await onSubmit(username.trim(), password);
      if (message) setError(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col bg-[var(--cc-background)]">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div
        className="relative flex flex-1 items-center justify-center p-4"
        style={{
          backgroundImage:
            "linear-gradient(rgba(7, 17, 31, 0.72), rgba(7, 17, 31, 0.88)), url(/bg-image/bg-main.png)",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="w-full max-w-md rounded-xl border border-[var(--cc-border-subtle)] bg-[var(--cc-surface-elevated)] p-6 shadow-2xl backdrop-blur-md">
          <div className="mb-6 flex flex-col items-center gap-4 text-center">
            <AppLogo className="max-h-8" />
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold tracking-tight text-[var(--cc-text-primary)]">
                {isAdmin ? "Platform Administration" : "Shamal Command Center"}
              </h1>
              <p className="text-sm text-[var(--cc-text-secondary)]">
                {isAdmin
                  ? "Secure sign-in for platform administration and configuration."
                  : "Enterprise drone operations — sign in with your assigned credentials."}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username" className="text-xs font-medium">
                Username
              </Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder={isAdmin ? "Administrator username" : "Username"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                required
                aria-invalid={!!error}
                className="h-9 bg-[var(--cc-surface-secondary)]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-xs font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  required
                  className="h-9 bg-[var(--cc-surface-secondary)] pr-10"
                  aria-invalid={!!error}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" className="h-9 w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
