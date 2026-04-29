"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { CircleOffIcon, Link2Icon, PaperclipIcon, PlayCircleIcon, PlusIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/shadcn/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Input } from "@/components/shadcn/ui/input";
import { Textarea } from "@/components/shadcn/ui/textarea";
import {
  apiClient,
  type Classroom,
  type ClassroomAnnouncement,
  type ClassroomMember,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";

type AttachmentComposerType = "none" | "file" | "link" | "youtube";

function formatPostedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "U";
  }
  if (words.length === 1) {
    return words[0].slice(0, 1).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export default function ClassroomDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();

  const classroomId = params.id;

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [members, setMembers] = useState<ClassroomMember[]>([]);
  const [announcements, setAnnouncements] = useState<ClassroomAnnouncement[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [announcementBody, setAnnouncementBody] = useState("");
  const [attachmentType, setAttachmentType] = useState<AttachmentComposerType>("none");
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);

  const isCreator = classroom?.membership_role === "creator";

  const activeMemberCount = useMemo(
    () => members.filter((member) => member.status === "active").length,
    [members],
  );

  const loadAnnouncements = async () => {
    setIsLoadingAnnouncements(true);
    try {
      const result = await apiClient.listClassroomAnnouncements(classroomId);
      setAnnouncements(result.announcements);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load announcements";
      toast.error(message);
    } finally {
      setIsLoadingAnnouncements(false);
    }
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }

    if (!isAuthenticated) {
      return;
    }

    async function loadData() {
      setIsLoadingPage(true);
      try {
        const [classroomResult, membersResult, announcementsResult] = await Promise.all([
          apiClient.getClassroom(classroomId),
          apiClient.listClassroomMembers(classroomId),
          apiClient.listClassroomAnnouncements(classroomId),
        ]);
        setClassroom(classroomResult);
        setMembers(membersResult.members);
        setAnnouncements(announcementsResult.announcements);
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
  }, [classroomId, isAuthenticated, isLoading, router]);

  const resetAnnouncementComposer = () => {
    setAnnouncementBody("");
    setAttachmentType("none");
    setAttachmentTitle("");
    setAttachmentUrl("");
    setAttachmentFile(null);
  };

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

  const handleCreateAnnouncement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isCreator) {
      return;
    }

    if (!announcementBody.trim()) {
      toast.error("Announcement text is required");
      return;
    }

    if (attachmentType === "file" && !attachmentFile) {
      toast.error("Choose a file to attach");
      return;
    }

    if ((attachmentType === "link" || attachmentType === "youtube") && !attachmentUrl.trim()) {
      toast.error("Provide a valid URL");
      return;
    }

    setIsPostingAnnouncement(true);
    try {
      await apiClient.createClassroomAnnouncement(classroomId, {
        body: announcementBody,
        attachmentType: attachmentType === "none" ? undefined : attachmentType,
        attachmentTitle: attachmentTitle.trim() || undefined,
        attachmentUrl: attachmentUrl.trim() || undefined,
        file: attachmentType === "file" ? attachmentFile ?? undefined : undefined,
      });
      resetAnnouncementComposer();
      setIsAnnouncementModalOpen(false);
      await loadAnnouncements();
      toast.success("Announcement posted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not post announcement";
      toast.error(message);
    } finally {
      setIsPostingAnnouncement(false);
    }
  };

  const handleOpenFile = async (fileId: string) => {
    try {
      const result = await apiClient.getFileDownloadUrl(fileId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open file";
      toast.error(message);
    }
  };

  const handleOpenAttachment = async (announcement: ClassroomAnnouncement) => {
    if (!announcement.attachment) {
      return;
    }

    if (announcement.attachment.type === "file" && announcement.attachment.file) {
      await handleOpenFile(announcement.attachment.file.id);
      return;
    }

    if ((announcement.attachment.type === "link" || announcement.attachment.type === "youtube") && announcement.attachment.url) {
      window.open(announcement.attachment.url, "_blank", "noopener,noreferrer");
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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <Link className="text-sm text-blue-700 hover:underline" href="/dashboard">
        Back to dashboard
      </Link>

      <section className="relative overflow-hidden rounded-2xl border border-slate-300 bg-gradient-to-r from-slate-600 via-slate-700 to-slate-800 px-6 py-8 text-white shadow-sm">
        <div className="absolute right-6 top-6 hidden rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium backdrop-blur sm:block">
          Stream
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{classroom.name}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-100/90">
          {classroom.description?.trim() || "Classroom stream for announcements and shared materials."}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Class code</p>
            <p className="mt-2 text-3xl font-semibold tracking-wide text-slate-700">{classroom.join_code}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <UsersIcon className="size-4" />
              <p className="text-sm font-medium">People</p>
            </div>
            <p className="mt-2 text-sm text-slate-600">{activeMemberCount} active member(s)</p>
            <div className="mt-3 space-y-2">
              {members.map((member) => (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-2 py-1.5" key={member.user_id}>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{member.name}</p>
                    <p className="text-xs text-slate-500">{member.role}</p>
                  </div>
                  {isCreator && member.role === "member" ? (
                    <Button onClick={() => void handleRemoveMember(member.user_id)} size="sm" variant="outline">
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {isCreator ? (
            <form className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleSave}>
              <p className="text-sm font-semibold text-slate-800">Classroom settings</p>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
              <Button className="w-full" disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
              <Button className="w-full" onClick={handleRegenerateCode} type="button" variant="outline">
                Regenerate join code
              </Button>
              <Button className="w-full" onClick={handleArchive} type="button" variant="destructive">
                Archive classroom
              </Button>
            </form>
          ) : null}
        </aside>

        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            {isCreator ? (
              <div className="flex justify-end">
                <Button
                  className="h-11 w-fit gap-2 rounded-full bg-sky-100 px-5 text-sky-800 hover:bg-sky-200"
                  onClick={() => setIsAnnouncementModalOpen(true)}
                  type="button"
                  variant="secondary"
                >
                  <PlusIcon className="size-4" />
                  New announcement
                </Button>
              </div>
            ) : (
              <p className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-500">
                Only classroom creators can post announcements.
              </p>
            )}
          </div>

          {isLoadingAnnouncements ? <p className="text-sm text-slate-500">Loading announcements...</p> : null}

          {!isLoadingAnnouncements && announcements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No announcements yet.
            </div>
          ) : null}

          {!isLoadingAnnouncements
            ? announcements.map((announcement) => (
              <article className="rounded-xl border border-slate-200 bg-white shadow-sm" key={announcement.id}>
                <div className="flex items-start gap-3 px-4 py-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-700 text-sm font-semibold text-white">
                    {initialsFromName(announcement.created_by_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{announcement.created_by_name}</p>
                      <span className="text-xs text-slate-500">{formatPostedAt(announcement.created_at)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>

                    {announcement.attachment ? (
                      <button
                        className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100"
                        onClick={() => {
                          void handleOpenAttachment(announcement);
                        }}
                        type="button"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {announcement.attachment.title ||
                              (announcement.attachment.type === "file"
                                ? announcement.attachment.file?.filename
                                : announcement.attachment.url)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {announcement.attachment.type === "file"
                              ? `${announcement.attachment.file?.content_type ?? "file"}`
                              : announcement.attachment.type === "youtube"
                                ? "YouTube video"
                                : "External link"}
                          </p>
                        </div>
                        <div className="ml-3 text-slate-600">
                          {announcement.attachment.type === "file" ? (
                            <PaperclipIcon className="size-4" />
                          ) : announcement.attachment.type === "youtube" ? (
                            <PlayCircleIcon className="size-4" />
                          ) : (
                            <Link2Icon className="size-4" />
                          )}
                        </div>
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
            : null}
        </section>
      </div>

      <Dialog
        open={isAnnouncementModalOpen}
        onOpenChange={(open) => {
          setIsAnnouncementModalOpen(open);
          if (!open) {
            resetAnnouncementComposer();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Announcement</DialogTitle>
            <DialogDescription>Post an update to this classroom stream.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreateAnnouncement}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="announcement-body">
                Message
              </label>
              <Textarea
                id="announcement-body"
                placeholder="Announce something to your class"
                rows={6}
                value={announcementBody}
                onChange={(event) => setAnnouncementBody(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Attachment (optional)</p>
              <div className="grid gap-2 sm:grid-cols-4">
                <Button
                  className="gap-2"
                  onClick={() => setAttachmentType("none")}
                  type="button"
                  variant={attachmentType === "none" ? "default" : "outline"}
                >
                  <CircleOffIcon className="size-4" />
                  None
                </Button>
                <Button
                  className="gap-2"
                  onClick={() => setAttachmentType("file")}
                  type="button"
                  variant={attachmentType === "file" ? "default" : "outline"}
                >
                  <PaperclipIcon className="size-4" />
                  File
                </Button>
                <Button
                  className="gap-2"
                  onClick={() => setAttachmentType("link")}
                  type="button"
                  variant={attachmentType === "link" ? "default" : "outline"}
                >
                  <Link2Icon className="size-4" />
                  Link
                </Button>
                <Button
                  className="gap-2"
                  onClick={() => setAttachmentType("youtube")}
                  type="button"
                  variant={attachmentType === "youtube" ? "default" : "outline"}
                >
                  <PlayCircleIcon className="size-4" />
                  YouTube
                </Button>
              </div>
            </div>

            {attachmentType === "file" ? (
              <div className="space-y-2">
                <Input
                  accept="application/pdf,image/*"
                  type="file"
                  onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                />
                <Input
                  placeholder="Optional display title"
                  value={attachmentTitle}
                  onChange={(event) => setAttachmentTitle(event.target.value)}
                />
              </div>
            ) : null}

            {attachmentType === "link" || attachmentType === "youtube" ? (
              <div className="space-y-2">
                <Input
                  placeholder={attachmentType === "youtube" ? "YouTube URL" : "https://example.com"}
                  value={attachmentUrl}
                  onChange={(event) => setAttachmentUrl(event.target.value)}
                />
                <Input
                  placeholder="Optional display title"
                  value={attachmentTitle}
                  onChange={(event) => setAttachmentTitle(event.target.value)}
                />
              </div>
            ) : null}

            <DialogFooter>
              <Button
                onClick={() => {
                  setIsAnnouncementModalOpen(false);
                  resetAnnouncementComposer();
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isPostingAnnouncement} type="submit">
                {isPostingAnnouncement ? "Posting..." : "Announce"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
