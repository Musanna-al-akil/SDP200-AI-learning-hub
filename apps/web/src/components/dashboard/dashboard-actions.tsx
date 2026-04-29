"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOutIcon, PlusIcon, SettingsIcon, UserCircle2Icon, UsersIcon } from "lucide-react";

import { Button } from "@/components/shadcn/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/ui/dropdown-menu";
import { Input } from "@/components/shadcn/ui/input";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { SidebarMenuButton } from "@/components/shadcn/ui/sidebar";
import { apiClient } from "@/lib/api/client";
import { getInitials } from "@/lib/avatar";
import { useAuth } from "@/lib/auth/auth-provider";

import { useClassrooms } from "@/components/dashboard/classrooms-context";

type DashboardActionsProps = {
  variant: "header" | "sidebar";
};

export function DashboardActions({ variant }: DashboardActionsProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const userInitials = getInitials(user?.name);
  const { refreshClassrooms } = useClassrooms();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isJoinOpen, setIsJoinOpen] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const [createName, setCreateName] = React.useState("");
  const [createDescription, setCreateDescription] = React.useState("");
  const [joinCode, setJoinCode] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const [isJoining, setIsJoining] = React.useState(false);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createName.trim()) {
      return;
    }

    setIsCreating(true);
    try {
      const classroom = await apiClient.createClassroom({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
      });
      setIsCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      toast.success("Classroom created");
      await refreshClassrooms();
      router.push(`/dashboard/classrooms/${classroom.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create classroom";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!joinCode.trim()) {
      return;
    }

    setIsJoining(true);
    try {
      const result = await apiClient.joinClassroom(joinCode.trim());
      setIsJoinOpen(false);
      setJoinCode("");
      toast.success("Joined classroom");
      await refreshClassrooms();
      router.push(`/dashboard/classrooms/${result.classroom.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join classroom";
      toast.error(message);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace("/");
      toast.success("Logged out");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Logout failed";
      toast.error(message);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const createJoinMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "header" ? (
          <Button aria-label="Create or join classroom" size="icon" variant="ghost">
            <PlusIcon className="size-5" />
          </Button>
        ) : (
          <SidebarMenuButton>
            <PlusIcon />
            <span>Create or join</span>
          </SidebarMenuButton>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "header" ? "end" : "start"} className="w-52">
        <DropdownMenuItem onSelect={() => setIsCreateOpen(true)}>
          <PlusIcon />
          Create classroom
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setIsJoinOpen(true)}>
          <UsersIcon />
          Join classroom
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {variant === "header" ? (
        <div className="flex items-center gap-1">
          {createJoinMenu}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Account menu" size="icon" variant="ghost">
                {user ? (
                  <Avatar className="size-7">
                    <AvatarImage src={user.avatarUrl} alt={user.name} />
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                ) : (
                  <UserCircle2Icon className="size-5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Avatar className="size-8">
                    <AvatarImage src={user?.avatarUrl} alt={user?.name ?? "User"} />
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <p className="truncate text-sm font-medium">{user?.name ?? "User"}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <SettingsIcon />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLoggingOut} onSelect={() => void handleLogout()}>
                <LogOutIcon />
                {isLoggingOut ? "Logging out..." : "Logout"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        createJoinMenu
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create classroom</DialogTitle>
            <DialogDescription>Create a new class and invite members with a join code.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleCreate}>
            <Input
              required
              maxLength={120}
              placeholder="Class name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
            />
            <Textarea
              maxLength={500}
              placeholder="Description (optional)"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
            />
            <DialogFooter className="-mx-0 -mb-0 border-0 bg-transparent p-0 pt-2">
              <Button disabled={isCreating} type="submit">
                {isCreating ? "Creating..." : "Create classroom"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join classroom</DialogTitle>
            <DialogDescription>Enter a class join code shared by the classroom creator.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleJoin}>
            <Input
              required
              maxLength={32}
              placeholder="Join code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            />
            <DialogFooter className="-mx-0 -mb-0 border-0 bg-transparent p-0 pt-2">
              <Button disabled={isJoining} type="submit">
                {isJoining ? "Joining..." : "Join classroom"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SidebarSettingsAction() {
  return (
    <SidebarMenuButton asChild>
      <Link href="/dashboard/settings">
        <SettingsIcon />
        <span>Settings</span>
      </Link>
    </SidebarMenuButton>
  );
}

export function SidebarLogoutAction() {
  const router = useRouter();
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace("/");
      toast.success("Logged out");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Logout failed";
      toast.error(message);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <SidebarMenuButton onClick={() => void handleLogout()}>
      <LogOutIcon />
      <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>
    </SidebarMenuButton>
  );
}
