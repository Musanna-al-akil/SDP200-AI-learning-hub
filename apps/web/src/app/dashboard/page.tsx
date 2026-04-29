"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/shadcn/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";

export default function DashboardPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, user, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
      router.replace("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Logout failed";
      toast.error(message);
    }
  };

  if (isLoading || !isAuthenticated) {
    return <main className="p-8 text-sm text-muted-foreground">Loading dashboard...</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">Welcome back, {user?.name ?? user?.email}.</p>
      <div>
        <Button onClick={handleLogout}>Logout</Button>
      </div>
    </main>
  );
}
