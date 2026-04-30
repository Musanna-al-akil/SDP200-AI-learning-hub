"use client";

import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/shadcn/ui/button";
import { Input } from "@/components/shadcn/ui/input";
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
    return (
      <div className="flex items-center justify-center rounded-2xl border bg-white p-8 text-sm text-muted-foreground shadow-sm">
        <Loader2Icon className="mr-2 size-4 animate-spin" />
        Checking authentication...
      </div>
    );
  }

  return (
    <section className="w-full rounded-2xl border bg-white p-6 shadow-sm sm:p-7">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl border bg-slate-950 text-sm font-semibold text-white">
          AC
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Aura Classroom</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {mode === "signup" ? "Create an account to get started." : "Sign in to continue."}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 rounded-lg border bg-stone-50 p-1">
        <Button
          type="button"
          variant="ghost"
          className={mode === "login" ? "bg-white text-slate-950 shadow-sm hover:bg-white" : "text-slate-500"}
          onClick={() => setMode("login")}
        >
          Login
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={mode === "signup" ? "bg-white text-slate-950 shadow-sm hover:bg-white" : "text-slate-500"}
          onClick={() => setMode("signup")}
        >
          Sign up
        </Button>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {mode === "signup" ? (
          <label className="block text-sm font-medium text-slate-700">
            Full name
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Full name"
              className="mt-2 h-10 bg-white px-3"
            />
          </label>
        ) : null}

        <label className="block text-sm font-medium text-slate-700">
          Email
          <Input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email address"
            className="mt-2 h-10 bg-white px-3"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Password
          <Input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="mt-2 h-10 bg-white px-3"
          />
        </label>

        <Button className="h-10 w-full bg-slate-950 text-white hover:bg-slate-800" disabled={isSubmitting} type="submit">
          {isSubmitting ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              Please wait...
            </>
          ) : mode === "signup" ? (
            "Create account"
          ) : (
            "Login"
          )}
        </Button>
      </form>
    </section>
  );
}
