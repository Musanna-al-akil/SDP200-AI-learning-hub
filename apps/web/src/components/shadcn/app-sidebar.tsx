"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  ArchiveIcon,
  BookOpenIcon,
  GraduationCapIcon,
  HomeIcon,
  Loader2Icon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { DashboardActions, SidebarLogoutAction, SidebarSettingsAction } from "@/components/dashboard/dashboard-actions";
import { useClassrooms } from "@/components/dashboard/classrooms-context";
import { Button } from "@/components/shadcn/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { apiClient, type Classroom } from "@/lib/api/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/shadcn/ui/sidebar";

function getClassInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "CL";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function ClassroomLinkItem({ classroom }: { classroom: Classroom }) {
  const pathname = usePathname();
  const href = `/dashboard/classrooms/${classroom.id}`;
  const isActive = pathname === href;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={classroom.name}>
        <Link href={href}>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-semibold text-sidebar-accent-foreground">
            {getClassInitials(classroom.name)}
          </span>
          <span className="truncate">{classroom.name}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { classrooms, isLoadingClassrooms, refreshClassrooms } = useClassrooms();
  const [archivingId, setArchivingId] = React.useState<string | null>(null);
  const [classroomToArchive, setClassroomToArchive] = React.useState<Classroom | null>(null);

  const createdClasses = React.useMemo(
    () => classrooms.filter((classroom) => classroom.membership_role === "creator"),
    [classrooms],
  );
  const enrolledClasses = React.useMemo(
    () => classrooms.filter((classroom) => classroom.membership_role === "member"),
    [classrooms],
  );
  const hasCreatorClasses = createdClasses.length > 0;

  const handleArchive = async () => {
    if (!classroomToArchive) {
      return;
    }
    const classroom = classroomToArchive;
    setArchivingId(classroom.id);
    try {
      await apiClient.archiveClassroom(classroom.id);
      toast.success("Classroom archived");
      await refreshClassrooms();
      setClassroomToArchive(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Archive failed";
      toast.error(message);
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="border-b border-sidebar-border/60 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Dashboard Home">
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <GraduationCapIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Aura Classroom</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">Teaching workspace</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Home">
                  <Link href="/dashboard">
                    <HomeIcon />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <DashboardActions variant="sidebar" />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton disabled={!hasCreatorClasses}>
                      <ArchiveIcon />
                      <span>Archive classroom</span>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60">
                    {createdClasses.map((classroom) => (
                      <DropdownMenuItem
                        disabled={archivingId === classroom.id}
                        key={classroom.id}
                        onSelect={() => {
                          setClassroomToArchive(classroom);
                        }}
                      >
                        <ArchiveIcon />
                        <span className="truncate">
                          {archivingId === classroom.id ? "Archiving..." : classroom.name}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex w-full items-center justify-between">
              <span>Created by me</span>
              <span className="text-xs text-sidebar-foreground/60">{createdClasses.length}</span>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoadingClassrooms ? (
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Loader2Icon className="animate-spin" />
                    <span>Loading classes...</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : createdClasses.length > 0 ? (
                createdClasses.map((classroom) => <ClassroomLinkItem key={classroom.id} classroom={classroom} />)
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <BookOpenIcon />
                    <span>No created classes yet</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex w-full items-center justify-between">
              <span>Enrolled</span>
              <span className="text-xs text-sidebar-foreground/60">{enrolledClasses.length}</span>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoadingClassrooms ? (
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Loader2Icon className="animate-spin" />
                    <span>Loading enrollments...</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : enrolledClasses.length > 0 ? (
                enrolledClasses.map((classroom) => <ClassroomLinkItem key={classroom.id} classroom={classroom} />)
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <UsersIcon />
                    <span>No enrolled classes yet</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarSettingsAction />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarLogoutAction />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <Dialog
        open={Boolean(classroomToArchive)}
        onOpenChange={(open) => {
          if (!open && !archivingId) {
            setClassroomToArchive(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive classroom?</DialogTitle>
            <DialogDescription>
              {classroomToArchive
                ? `This will archive "${classroomToArchive.name}" and remove it from active classrooms.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={Boolean(archivingId)}
              onClick={() => setClassroomToArchive(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={Boolean(archivingId)}
              onClick={() => {
                void handleArchive();
              }}
              type="button"
              variant="destructive"
            >
              {archivingId ? "Archiving..." : "Archive classroom"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
