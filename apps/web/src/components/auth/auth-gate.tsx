"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/shadcn/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";

export function AuthGate() {
  const router = useRouter();
  const { isLoading, isAuthenticated, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        await register({ name, email, password });
        toast.success("Account created successfully");
      } else {
        await login({ email, password });
        toast.success("Logged in successfully");
      }
      router.replace("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || isAuthenticated) {
    return <div className="text-sm text-muted-foreground">Checking authentication...</div>;
  }

  return (
    <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <Button type="button" variant={mode === "login" ? "default" : "outline"} onClick={() => setMode("login")}>
          Login
        </Button>
        <Button type="button" variant={mode === "signup" ? "default" : "outline"} onClick={() => setMode("signup")}>
          Sign up
        </Button>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        {mode === "signup" ? (
          <input
            required
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Full name"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        ) : null}

        <input
          required
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="Email"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />

        <input
          required
          minLength={8}
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="Password"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />

        <Button className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
        </Button>
      </form>
    </section>
  );
}
