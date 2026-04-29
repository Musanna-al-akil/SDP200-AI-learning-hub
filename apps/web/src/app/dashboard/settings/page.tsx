"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/shadcn/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/ui/card";
import { Input } from "@/components/shadcn/ui/input";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, refreshMe } = useAuth();

  const [name, setName] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");

  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [isSavingPassword, setIsSavingPassword] = React.useState(false);

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  React.useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user?.name]);

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Name cannot be empty.");
      return;
    }

    setIsSavingProfile(true);
    try {
      await apiClient.updateMe({ name: trimmedName });
      await refreshMe();
      toast.success("Profile updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update profile.";
      toast.error(message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentPassword || !newPassword) {
      toast.error("Current password and new password are required.");
      return;
    }

    setIsSavingPassword(true);
    try {
      await apiClient.updateMe({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update password.";
      toast.error(message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return <main className="p-6 text-sm text-muted-foreground">Loading settings...</main>;
  }

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and account security.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update the name shown across your classrooms.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleProfileSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="settings-name">
                Name
              </label>
              <Input
                id="settings-name"
                maxLength={255}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button disabled={isSavingProfile} type="submit">
              {isSavingProfile ? "Saving..." : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Change your password by confirming your current password first.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handlePasswordSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="settings-current-password">
                Current password
              </label>
              <Input
                id="settings-current-password"
                minLength={8}
                required
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="settings-new-password">
                New password
              </label>
              <Input
                id="settings-new-password"
                minLength={8}
                required
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <Button disabled={isSavingPassword} type="submit">
              {isSavingPassword ? "Updating..." : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
