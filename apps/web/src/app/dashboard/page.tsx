"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ArchiveIcon, CopyIcon, MoreVerticalIcon } from "lucide-react";
import { toast } from "sonner";

import { useClassrooms } from "@/components/dashboard/classrooms-context";
import { Button } from "@/components/shadcn/ui/button";
import { Card, CardContent } from "@/components/shadcn/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/ui/dropdown-menu";
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
    <Card className="group w-full max-w-[22rem] overflow-hidden rounded-xl border-border/70 bg-card p-0 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/dashboard/classrooms/${classroom.id}`}>
        <div className={`relative h-28 bg-gradient-to-r ${accent} px-4 py-3 text-white`}>
          <p className="line-clamp-2 text-3xl font-semibold tracking-tight" style={{ fontSize: "1.85rem", lineHeight: "2rem" }}>
            {classroom.name}
          </p>
          <p className="mt-1 text-sm text-white/90">
            {classroom.description?.trim() || (classroom.membership_role === "creator" ? "Created by you" : "Joined classroom")}
          </p>
          <p className="text-xs font-medium text-white/85">Teacher: {teacherLabel}</p>
          <span className="absolute right-4 bottom-[-18px] inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-sm font-semibold text-slate-700 shadow-sm">
            {classroom.name.slice(0, 1).toUpperCase()}
          </span>
        </div>

        <CardContent className="h-36 border-t bg-white p-0" />
      </Link>

      <div className="flex h-12 items-center justify-end border-t px-3">
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

export default function DashboardPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();
  const { classrooms, isLoadingClassrooms, classroomsError, refreshClassrooms } = useClassrooms();
  const [archivingId, setArchivingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }

    if (isAuthenticated) {
      void refreshClassrooms();
    }
  }, [isAuthenticated, isLoading, refreshClassrooms, router]);

  const handleArchive = async (classroom: Classroom) => {
    if (classroom.membership_role !== "creator") {
      toast.error("Only creators can archive classrooms.");
      return;
    }
    if (!window.confirm(`Archive "${classroom.name}"?`)) {
      return;
    }

    setArchivingId(classroom.id);
    try {
      await apiClient.archiveClassroom(classroom.id);
      toast.success("Classroom archived");
      await refreshClassrooms();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Archive failed";
      toast.error(message);
    } finally {
      setArchivingId(null);
    }
  };

  if (isLoading || isLoadingClassrooms) {
    return <main className="p-6 text-sm text-muted-foreground">Loading your classrooms...</main>;
  }

  if (classroomsError) {
    return (
      <main className="p-6">
        <Card>
          <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
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
    <main className="min-h-[calc(100svh-4rem)] space-y-5 bg-[#f1f3f4] p-4 md:p-6">
      {classrooms.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
            <p className="text-foreground">No classrooms yet.</p>
            <p>Use the + menu to create or join a classroom.</p>
          </CardContent>
        </Card>
      ) : null}

      <section>
        <div className="grid justify-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(16rem,22rem))]">
          {classrooms.map((classroom, index) => (
            <ClassroomBoardCard
              classroom={classroom}
              index={index}
              isArchiving={archivingId === classroom.id}
              key={classroom.id}
              onArchive={handleArchive}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
