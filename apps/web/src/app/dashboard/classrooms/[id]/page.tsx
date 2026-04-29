"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/shadcn/ui/button";
import { apiClient, type Classroom, type ClassroomMember } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";

export default function ClassroomDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();

  const classroomId = params.id;

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAuthenticated) {
      async function loadData() {
        setIsLoadingPage(true);
        try {
          const [classroomResult, membersResult] = await Promise.all([
            apiClient.getClassroom(classroomId),
            apiClient.listClassroomMembers(classroomId),
          ]);
          setClassroom(classroomResult);
          setMembers(membersResult.members);
          setName(classroomResult.name);
          setDescription(classroomResult.description ?? "");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to load classroom";
          toast.error(message);
          router.replace("/dashboard");
        } finally {
          setIsLoadingPage(false);
        }
      }
      void loadData();
    }
  }, [classroomId, isAuthenticated, isLoading, router]);

  const isCreator = classroom?.membership_role === "creator";

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isCreator || !classroom) {
      return;
    }
    setIsSaving(true);
    try {
      const updated = await apiClient.updateClassroom(classroom.id, {
        name: name.trim(),
        description: description.trim(),
      });
      setClassroom(updated);
      toast.success("Classroom updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateCode = async () => {
    if (!isCreator || !classroom) {
      return;
    }
    try {
      const updated = await apiClient.regenerateJoinCode(classroom.id);
      setClassroom(updated);
      toast.success("Join code regenerated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Regenerate join code failed";
      toast.error(message);
    }
  };

  const handleArchive = async () => {
    if (!isCreator || !classroom) {
      return;
    }
    if (!window.confirm("Archive this classroom?")) {
      return;
    }
    try {
      await apiClient.archiveClassroom(classroom.id);
      toast.success("Classroom archived");
      router.replace("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Archive failed";
      toast.error(message);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!isCreator || !classroom) {
      return;
    }
    if (!window.confirm("Remove this member?")) {
      return;
    }
    try {
      await apiClient.removeClassroomMember(classroom.id, memberUserId);
      setMembers((previous) => previous.filter((member) => member.user_id !== memberUserId));
      toast.success("Member removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Remove member failed";
      toast.error(message);
    }
  };

  if (isLoading || !isAuthenticated || isLoadingPage) {
    return <main className="p-8 text-sm text-muted-foreground">Loading classroom...</main>;
  }

  if (!classroom) {
    return <main className="p-8 text-sm text-muted-foreground">Classroom not found.</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 p-8">
      <Link className="text-sm text-blue-600 hover:underline" href="/dashboard">
        Back to dashboard
      </Link>
      <h1 className="text-2xl font-semibold">{classroom.name}</h1>
      <p className="text-muted-foreground">{classroom.description || "No description"}</p>
      <p className="text-sm text-muted-foreground">
        Role: {classroom.membership_role} | Join code: {classroom.join_code}
      </p>

      {isCreator ? (
        <form className="flex flex-col gap-2 rounded border p-4" onSubmit={handleSave}>
          <h2 className="text-lg font-medium">Edit classroom</h2>
          <input
            className="rounded border px-3 py-2 text-sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <textarea
            className="rounded border px-3 py-2 text-sm"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Button disabled={isSaving} type="submit">
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button onClick={handleRegenerateCode} type="button" variant="outline">
            Regenerate join code
          </Button>
          <Button onClick={handleArchive} type="button" variant="destructive">
            Archive classroom
          </Button>
        </form>
      ) : null}

      <section className="flex flex-col gap-2 rounded border p-4">
        <h2 className="text-lg font-medium">Members</h2>
        {members.map((member) => (
          <div className="flex items-center justify-between rounded border p-2" key={member.user_id}>
            <div>
              <p className="font-medium">{member.name}</p>
              <p className="text-sm text-muted-foreground">
                {member.email} ({member.role})
              </p>
            </div>
            {isCreator && member.role === "member" ? (
              <Button onClick={() => void handleRemoveMember(member.user_id)} size="sm" variant="outline">
                Remove
              </Button>
            ) : null}
          </div>
        ))}
      </section>
    </main>
  );
}
