/* eslint-disable @next/next/no-img-element */
"use client";

import {
  ArchiveIcon,
  BookOpenCheckIcon,
  CopyIcon,
  GraduationCapIcon,
  MoreVerticalIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useClassrooms } from "@/components/dashboard/classrooms-context";
import { Button } from "@/components/shadcn/ui/button";
import { Card, CardContent } from "@/components/shadcn/ui/card";
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
  DropdownMenuTrigger,
} from "@/components/shadcn/ui/dropdown-menu";
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import { apiClient, type Classroom } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";

const cardAccents = [
  "from-[#3f6f86] to-[#4e7e93]",
  "from-[#0f9d8a] to-[#12a39f]",
  "from-[#f28b61] to-[#ea7a61]",
  "from-[#8e44ad] to-[#7e57c2]",
  "from-[#34a853] to-[#2e9d70]",
  "from-[#5f6368] to-[#69757e]",
];

function ClassroomBoardCard({
  classroom,
  index,
  onArchive,
  isArchiving,
}: {
  classroom: Classroom;
  index: number;
  onArchive: (classroom: Classroom) => Promise<void>;
  isArchiving: boolean;
}) {
  const accent = cardAccents[index % cardAccents.length];
  const teacherLabel = classroom.creator_name;
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(classroom.join_code);
      toast.success("Join code copied");
    } catch {
      toast.error("Could not copy join code");
    }
  };

  return (
    <Card className="interactive-lift group w-full overflow-hidden rounded-xl border-border/70 bg-card p-0 shadow-sm transition duration-200">
      <Link
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
        href={`/dashboard/classrooms/${classroom.id}`}
      >
        <div className={`relative min-h-32 bg-gradient-to-r ${accent} px-4 py-4 text-white`}>
          <div className="mb-4 inline-flex items-center rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[11px] font-medium capitalize backdrop-blur">
            {classroom.membership_role}
          </div>
          <p className="line-clamp-2 text-2xl font-semibold tracking-tight">
            {classroom.name}
          </p>
          <p className="mt-1 line-clamp-2 min-h-9 text-sm leading-5 text-white/90">
            {classroom.description?.trim() || "Class stream and AI study materials"}
          </p>
          <span className="absolute right-4 bottom-[-20px] inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white/95 text-sm font-semibold text-slate-700 shadow-sm ring-4 ring-white/70">
            <img
              src={"https://api.dicebear.com/9.x/adventurer/svg?seed=" + classroom.creator_name}
              alt={classroom.creator_name}
              className="size-full transition duration-200 group-hover:scale-105"
            />
          </span>
        </div>

        <CardContent className="space-y-4 border-t bg-white px-4 pb-4 pt-7">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Creator</p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">{teacherLabel}</p>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-xs font-medium text-slate-500">Join code</span>
            <span className="font-mono text-sm font-semibold tracking-wide text-slate-800">{classroom.join_code}</span>
          </div>
        </CardContent>
      </Link>

      <div className="flex h-12 items-center justify-between border-t bg-slate-50/70 px-3">
        <span className="text-xs text-muted-foreground">Open classroom</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost">
              <MoreVerticalIcon className="size-4" />
              <span className="sr-only">Classroom actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onSelect={() => {
                void handleCopyCode();
              }}
            >
              <CopyIcon />
              Copy code
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={classroom.membership_role !== "creator" || isArchiving}
              onSelect={() => {
                void onArchive(classroom);
              }}
            >
              <ArchiveIcon />
              {isArchiving ? "Archiving..." : "Archive"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <main className="min-h-[calc(100svh-4rem)] bg-[#f6f7f4] p-4 md:p-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card className="w-full overflow-hidden rounded-xl bg-white p-0 shadow-sm" key={index}>
            <Skeleton className="h-32 rounded-none" />
            <div className="space-y-4 px-4 pb-4 pt-7">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}

function EmptyDashboardState() {
  return (
    <div className="mx-auto flex min-h-[55svh] max-w-xl flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
        <BookOpenCheckIcon className="size-6" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">Start your first classroom</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
        Create a class or join one with a code from the plus menu in the header.
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();
  const { classrooms, isLoadingClassrooms, classroomsError, refreshClassrooms } = useClassrooms();
  const [archivingId, setArchivingId] = React.useState<string | null>(null);
  const [classroomToArchive, setClassroomToArchive] = React.useState<Classroom | null>(null);

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }

    if (isAuthenticated) {
      void refreshClassrooms();
    }
  }, [isAuthenticated, isLoading, refreshClassrooms, router]);

  const handleArchive = async () => {
    if (!classroomToArchive) {
      return;
    }
    const classroom = classroomToArchive;
    if (classroom.membership_role !== "creator") {
      toast.error("Only creators can archive classrooms.");
      return;
    }

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

  if (isLoading || isLoadingClassrooms) {
    return <DashboardSkeleton />;
  }

  if (classroomsError) {
    return (
      <main className="min-h-[calc(100svh-4rem)] bg-[#f6f7f4] p-4 md:p-6">
        <Card className="mx-auto max-w-xl rounded-xl bg-white shadow-sm">
          <CardContent className="space-y-4 p-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-3 text-foreground">
              <GraduationCapIcon className="size-5 text-sky-700" />
              <p className="font-medium">Classrooms could not load</p>
            </div>
            <p>{classroomsError}</p>
            <Button onClick={() => void refreshClassrooms()} size="sm" type="button" variant="outline">
              Try again
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="page-enter min-h-[calc(100svh-4rem)] space-y-5 bg-[#f6f7f4] p-4 md:p-6">
      {classrooms.length === 0 ? <EmptyDashboardState /> : null}

      <section aria-label="Classrooms">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {classrooms.map((classroom, index) => (
            <ClassroomBoardCard
              classroom={classroom}
              index={index}
              isArchiving={archivingId === classroom.id}
              key={classroom.id}
              onArchive={async (selectedClassroom) => {
                setClassroomToArchive(selectedClassroom);
              }}
            />
          ))}
        </div>
      </section>

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
            <Button disabled={Boolean(archivingId)} onClick={() => void handleArchive()} type="button" variant="destructive">
              {archivingId ? "Archiving..." : "Archive classroom"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
