/* eslint-disable @next/next/no-img-element */
"use client";

import { ChevronDownIcon, CircleOffIcon, Link2Icon, Loader2Icon, PaperclipIcon, PlayCircleIcon, PlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  type ClassroomFile,
  type ClassroomMember,
  type FileQuiz,
  type FileSummary,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";

type AttachmentComposerType = "none" | "file" | "link" | "youtube";

const PDF_PROCESSING_POLL_MS = 1500;
type QuizResult = { score: number; total: number };

function formatPostedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function getFileStatusLabel(attachment: ClassroomAnnouncement["attachment"]): string {
  if (attachment?.type !== "file" || !attachment.file) {
    return "";
  }

  if (attachment.file.content_type !== "application/pdf") {
    return attachment.file.content_type;
  }

  if (attachment.file.processing_status === "processing") {
    return "Processing PDF...";
  }

  if (attachment.file.processing_status === "completed") {
    return "PDF processed";
  }

  if (attachment.file.processing_status === "failed") {
    return "PDF processing failed";
  }

  return "PDF";
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
  const [summaryByFileId, setSummaryByFileId] = useState<Record<string, FileSummary>>({});
  const [isSummaryLoadingByFileId, setIsSummaryLoadingByFileId] = useState<Record<string, boolean>>({});
  const [isSummaryGeneratingByFileId, setIsSummaryGeneratingByFileId] = useState<Record<string, boolean>>({});
  const [quizByFileId, setQuizByFileId] = useState<Record<string, FileQuiz>>({});
  const [isQuizLoadingByFileId, setIsQuizLoadingByFileId] = useState<Record<string, boolean>>({});
  const [isQuizGeneratingByFileId, setIsQuizGeneratingByFileId] = useState<Record<string, boolean>>({});
  const [quizAnswersByFileId, setQuizAnswersByFileId] = useState<Record<string, Record<string, number>>>({});
  const [quizResultsByFileId, setQuizResultsByFileId] = useState<Record<string, QuizResult>>({});

  const isCreator = classroom?.membership_role === "creator";

  const activeMemberCount = useMemo(
    () => members.filter((member) => member.status === "active").length,
    [members],
  );

  const loadAnnouncements = useCallback(async () => {
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
  }, [classroomId]);

  const waitForPdfProcessing = async (fileId: string): Promise<ClassroomFile> => {
    let currentFile = await apiClient.getFile(fileId);
    while (currentFile.processing_status === "processing") {
      await sleep(PDF_PROCESSING_POLL_MS);
      currentFile = await apiClient.getFile(fileId);
    }
    return currentFile;
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

  useEffect(() => {
    const hasProcessingPdf = announcements.some(
      (announcement) =>
        announcement.attachment?.type === "file" &&
        announcement.attachment.file?.content_type === "application/pdf" &&
        announcement.attachment.file.processing_status === "processing",
    );

    if (!hasProcessingPdf) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadAnnouncements();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [announcements, loadAnnouncements]);

  useEffect(() => {
    const summaryFileIds = announcements
      .filter(
        (announcement) =>
          announcement.attachment?.type === "file" &&
          announcement.attachment.file?.content_type === "application/pdf" &&
          announcement.attachment.file.processing_status === "completed",
      )
      .map((announcement) => announcement.attachment?.file?.id)
      .filter((value): value is string => Boolean(value));

    const missingFileIds = summaryFileIds.filter((fileId) => summaryByFileId[fileId] === undefined);
    if (missingFileIds.length === 0) {
      return;
    }

    void Promise.all(
      missingFileIds.map(async (fileId) => {
        try {
          const summary = await apiClient.getFileSummary(fileId);
          setSummaryByFileId((previous) => ({ ...previous, [fileId]: summary }));
        } catch {
          // Keep UI usable even if one summary fetch fails.
        }
      }),
    );
  }, [announcements, summaryByFileId]);

  useEffect(() => {
    const quizFileIds = announcements
      .filter(
        (announcement) =>
          announcement.attachment?.type === "file" &&
          announcement.attachment.file?.content_type === "application/pdf" &&
          announcement.attachment.file.processing_status === "completed",
      )
      .map((announcement) => announcement.attachment?.file?.id)
      .filter((value): value is string => Boolean(value));

    const missingFileIds = quizFileIds.filter((fileId) => quizByFileId[fileId] === undefined);
    if (missingFileIds.length === 0) {
      return;
    }

    void Promise.all(
      missingFileIds.map(async (fileId) => {
        try {
          const quiz = await apiClient.getFileQuiz(fileId);
          setQuizByFileId((previous) => ({ ...previous, [fileId]: quiz }));
        } catch {
          // Keep UI usable even if one quiz fetch fails.
        }
      }),
    );
  }, [announcements, quizByFileId]);

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
      const announcement = await apiClient.createClassroomAnnouncement(classroomId, {
        body: announcementBody,
        attachmentType: attachmentType === "none" ? undefined : attachmentType,
        attachmentTitle: attachmentTitle.trim() || undefined,
        attachmentUrl: attachmentUrl.trim() || undefined,
        file: attachmentType === "file" ? attachmentFile ?? undefined : undefined,
      });

      const attachedFile = announcement.attachment?.type === "file" ? announcement.attachment.file : null;
      if (attachedFile?.content_type === "application/pdf" && attachedFile.processing_status === "processing") {
        const processedFile = await waitForPdfProcessing(attachedFile.id);
        if (processedFile.processing_status === "failed") {
          toast.error(processedFile.processing_error ?? "PDF processing failed");
        }
      }

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
      const summary = await apiClient.getFileSummary(fileId);
      setSummaryByFileId((previous) => ({ ...previous, [fileId]: summary }));
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

  const handleLoadSummary = async (fileId: string) => {
    setIsSummaryLoadingByFileId((previous) => ({ ...previous, [fileId]: true }));
    try {
      const summary = await apiClient.getFileSummary(fileId);
      setSummaryByFileId((previous) => ({ ...previous, [fileId]: summary }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load summary";
      toast.error(message);
    } finally {
      setIsSummaryLoadingByFileId((previous) => ({ ...previous, [fileId]: false }));
    }
  };

  const handleGenerateSummary = async (fileId: string, regenerate = false) => {
    setIsSummaryGeneratingByFileId((previous) => ({ ...previous, [fileId]: true }));
    try {
      const summary = await apiClient.generateFileSummary(fileId, { regenerate });
      setSummaryByFileId((previous) => ({ ...previous, [fileId]: summary }));
      toast.success(regenerate ? "Summary regenerated" : "Summary generated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate summary";
      toast.error(message);
      await handleLoadSummary(fileId);
    } finally {
      setIsSummaryGeneratingByFileId((previous) => ({ ...previous, [fileId]: false }));
    }
  };

  const handleLoadQuiz = async (fileId: string) => {
    setIsQuizLoadingByFileId((previous) => ({ ...previous, [fileId]: true }));
    try {
      const quiz = await apiClient.getFileQuiz(fileId);
      setQuizByFileId((previous) => ({ ...previous, [fileId]: quiz }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load quiz";
      toast.error(message);
    } finally {
      setIsQuizLoadingByFileId((previous) => ({ ...previous, [fileId]: false }));
    }
  };

  const handleGenerateQuiz = async (fileId: string, regenerate = false) => {
    setIsQuizGeneratingByFileId((previous) => ({ ...previous, [fileId]: true }));
    try {
      const quiz = await apiClient.generateFileQuiz(fileId, { regenerate });
      setQuizByFileId((previous) => ({ ...previous, [fileId]: quiz }));
      setQuizAnswersByFileId((previous) => ({ ...previous, [fileId]: {} }));
      setQuizResultsByFileId((previous) => {
        const next = { ...previous };
        delete next[fileId];
        return next;
      });
      toast.success(regenerate ? "Quiz regenerated" : "Quiz generated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate quiz";
      toast.error(message);
      await handleLoadQuiz(fileId);
    } finally {
      setIsQuizGeneratingByFileId((previous) => ({ ...previous, [fileId]: false }));
    }
  };

  const handleSelectQuizOption = (fileId: string, questionId: string, optionIndex: number) => {
    setQuizAnswersByFileId((previous) => ({
      ...previous,
      [fileId]: {
        ...(previous[fileId] ?? {}),
        [questionId]: optionIndex,
      },
    }));
  };

  const handleSubmitQuiz = (fileId: string) => {
    const quiz = quizByFileId[fileId];
    if (!quiz || quiz.state !== "completed" || quiz.questions.length === 0) {
      return;
    }

    const answers = quizAnswersByFileId[fileId] ?? {};
    const score = quiz.questions.reduce((count, question) => {
      return answers[question.id] === question.correct_option_index ? count + 1 : count;
    }, 0);

    setQuizResultsByFileId((previous) => ({
      ...previous,
      [fileId]: { score, total: quiz.questions.length },
    }));
  };

  const handleResetQuiz = (fileId: string) => {
    setQuizAnswersByFileId((previous) => ({ ...previous, [fileId]: {} }));
    setQuizResultsByFileId((previous) => {
      const next = { ...previous };
      delete next[fileId];
      return next;
    });
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
            ? announcements.map((announcement) => {
              const summaryFileId =
                announcement.attachment?.type === "file" &&
                  announcement.attachment.file?.content_type === "application/pdf" &&
                  announcement.attachment.file.processing_status === "completed"
                  ? announcement.attachment.file.id
                  : null;
              const isSummaryCompleted =
                summaryFileId !== null && summaryByFileId[summaryFileId]?.state === "completed";

              return (
                <article className="rounded-xl border border-slate-200 bg-white shadow-sm" key={announcement.id}>
                  <div className="flex items-start gap-3 px-4 py-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-700 text-sm font-semibold text-white">
                      <img src={"https://api.dicebear.com/9.x/adventurer/svg?seed=" + announcement.created_by_name} alt={announcement.created_by_name} className="size-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">{announcement.created_by_name}</p>
                        <span className="text-xs text-slate-500">{formatPostedAt(announcement.created_at)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>

                      {announcement.attachment ? (
                        <div className="mt-3 space-y-2">
                          <button
                            className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100"
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
                                  ? getFileStatusLabel(announcement.attachment)
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

                          {summaryFileId ? (
                            <details
                              className={`group rounded-lg border p-3 transition ${isSummaryCompleted
                                ? "border-sky-300 bg-gradient-to-r from-sky-50 via-cyan-50 to-emerald-50 shadow-sm"
                                : "border-slate-200 bg-white"
                                } ${isSummaryGeneratingByFileId[summaryFileId] ? "ring-2 ring-sky-200/70" : ""}`}
                            >
                              <summary
                                className={`flex cursor-pointer list-none items-center justify-between text-sm font-semibold ${isSummaryCompleted ? "text-sky-900" : "text-slate-800"
                                  }`}
                              >
                                <span>
                                  {summaryByFileId[summaryFileId]?.state === "completed"
                                    ? "Summary available"
                                    : "AI Summary"}
                                </span>
                                <ChevronDownIcon
                                  className={`size-4 transition group-open:rotate-180 ${isSummaryCompleted ? "text-sky-600" : "text-slate-500"
                                    }`}
                                />
                              </summary>
                              <div className="mt-2 flex items-center justify-end gap-2 summary-open-content">
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                    disabled={Boolean(isSummaryLoadingByFileId[summaryFileId])}
                                    onClick={() => {
                                      void handleLoadSummary(summaryFileId);
                                    }}
                                  >
                                    Refresh
                                  </Button>
                                  {isCreator ? (
                                    <Button
                                      size="sm"
                                      type="button"
                                      disabled={Boolean(isSummaryGeneratingByFileId[summaryFileId])}
                                      onClick={() => {
                                        void handleGenerateSummary(summaryFileId, true);
                                      }}
                                    >
                                      {isSummaryGeneratingByFileId[summaryFileId] ? (
                                        <span className="inline-flex items-center gap-1.5">
                                          <Loader2Icon className="size-3.5 animate-spin motion-reduce:animate-none" />
                                          Regenerating...
                                        </span>
                                      ) : (
                                        "Regenerate"
                                      )}
                                    </Button>
                                  ) : null}
                                </div>
                              </div>

                              {isSummaryLoadingByFileId[summaryFileId] ? (
                                <p className="mt-2 text-sm text-slate-500">Loading summary...</p>
                              ) : null}

                              {!isSummaryLoadingByFileId[summaryFileId] &&
                                !summaryByFileId[summaryFileId] ? (
                                <div className="mt-2 space-y-2">
                                  <p className="text-sm text-slate-500">No summary loaded yet.</p>
                                  <Button
                                    size="sm"
                                    type="button"
                                    disabled={Boolean(isSummaryGeneratingByFileId[summaryFileId])}
                                    onClick={() => {
                                      void handleGenerateSummary(summaryFileId);
                                    }}
                                  >
                                    Generate summary
                                  </Button>
                                </div>
                              ) : null}

                              {summaryByFileId[summaryFileId]?.state === "empty" ? (
                                <div className="mt-2 space-y-2">
                                  <p className="text-sm text-slate-500">No summary available yet.</p>
                                  <Button
                                    size="sm"
                                    type="button"
                                    disabled={Boolean(isSummaryGeneratingByFileId[summaryFileId])}
                                    onClick={() => {
                                      void handleGenerateSummary(summaryFileId);
                                    }}
                                  >
                                    Generate summary
                                  </Button>
                                </div>
                              ) : null}

                              {summaryByFileId[summaryFileId]?.state === "pending" ? (
                                <p className="mt-2 text-sm text-slate-500">Summary generation in progress...</p>
                              ) : null}

                              {summaryByFileId[summaryFileId]?.state === "failed" ? (
                                <div className="mt-2 space-y-2">
                                  <p className="text-sm text-rose-600">
                                    {summaryByFileId[summaryFileId]?.error_message ?? "Summary generation failed."}
                                  </p>
                                  <Button
                                    size="sm"
                                    type="button"
                                    disabled={Boolean(isSummaryGeneratingByFileId[summaryFileId])}
                                    onClick={() => {
                                      void handleGenerateSummary(summaryFileId);
                                    }}
                                  >
                                    Retry
                                  </Button>
                                </div>
                              ) : null}

                              {summaryByFileId[summaryFileId]?.state === "completed" ? (
                                <div
                                  className="summary-open-content mt-2 overflow-x-auto text-sm leading-6 text-slate-700
                                  [&_a]:text-sky-700 [&_a]:underline
                                  [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600
                                  [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs
                                  [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold
                                  [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold
                                  [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold
                                  [&_li]:mb-1
                                  [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
                                  [&_p]:mb-2
                                  [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-100 [&_pre]:p-3
                                  [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left
                                  [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1
                                  [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium
                                  [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                                >
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {summaryByFileId[summaryFileId]?.content ?? ""}
                                  </ReactMarkdown>
                                </div>
                              ) : null}
                            </details>
                          ) : null}

                          {summaryFileId ? (
                            <details className="group rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-3 shadow-sm transition">
                              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-amber-900">
                                <span>{quizByFileId[summaryFileId]?.state === "completed" ? "Quiz available" : "AI Quiz"}</span>
                                <ChevronDownIcon className="size-4 text-amber-700 transition group-open:rotate-180" />
                              </summary>

                              <div className="mt-2 flex items-center justify-end gap-2 summary-open-content">
                                <Button
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                  disabled={Boolean(isQuizLoadingByFileId[summaryFileId])}
                                  onClick={() => {
                                    void handleLoadQuiz(summaryFileId);
                                  }}
                                >
                                  Refresh
                                </Button>
                                {isCreator ? (
                                  <Button
                                    size="sm"
                                    type="button"
                                    disabled={Boolean(isQuizGeneratingByFileId[summaryFileId])}
                                    onClick={() => {
                                      void handleGenerateQuiz(summaryFileId, quizByFileId[summaryFileId]?.state === "completed");
                                    }}
                                  >
                                    {isQuizGeneratingByFileId[summaryFileId] ? (
                                      <span className="inline-flex items-center gap-1.5">
                                        <Loader2Icon className="size-3.5 animate-spin motion-reduce:animate-none" />
                                        Generating...
                                      </span>
                                    ) : quizByFileId[summaryFileId]?.state === "completed" ? (
                                      "Regenerate"
                                    ) : (
                                      "Generate quiz"
                                    )}
                                  </Button>
                                ) : null}
                              </div>

                              {isQuizLoadingByFileId[summaryFileId] ? (
                                <p className="mt-2 text-sm text-slate-500">Loading quiz...</p>
                              ) : null}

                              {!isQuizLoadingByFileId[summaryFileId] && !quizByFileId[summaryFileId] ? (
                                <p className="mt-2 text-sm text-slate-500">No quiz loaded yet.</p>
                              ) : null}

                              {quizByFileId[summaryFileId]?.state === "empty" ? (
                                <p className="mt-2 text-sm text-slate-500">No quiz generated yet.</p>
                              ) : null}

                              {quizByFileId[summaryFileId]?.state === "pending" ? (
                                <p className="mt-2 text-sm text-slate-500">Quiz generation in progress...</p>
                              ) : null}

                              {quizByFileId[summaryFileId]?.state === "failed" ? (
                                <p className="mt-2 text-sm text-rose-600">
                                  {quizByFileId[summaryFileId]?.error_message ?? "Quiz generation failed."}
                                </p>
                              ) : null}

                              {quizByFileId[summaryFileId]?.state === "completed" ? (
                                <div className="summary-open-content mt-3 space-y-4">
                                  <p className="rounded-md bg-white/75 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-100">
                                    {quizByFileId[summaryFileId]?.title ?? "Generated Quiz"}
                                  </p>

                                  {quizByFileId[summaryFileId]?.questions.map((question, questionIndex) => {
                                    const selectedOption = quizAnswersByFileId[summaryFileId]?.[question.id];
                                    const result = quizResultsByFileId[summaryFileId];
                                    const showResult = Boolean(result);
                                    return (
                                      <div className="rounded-lg border border-amber-200/70 bg-white/80 p-3 shadow-sm" key={question.id}>
                                        <p className="text-sm font-medium text-slate-900">
                                          {questionIndex + 1}. {question.prompt}
                                        </p>
                                        <div className="mt-2 space-y-2">
                                          {question.options.map((option, optionIndex) => {
                                            const isSelected = selectedOption === optionIndex;
                                            const isCorrect = optionIndex === question.correct_option_index;
                                            const showCorrect = showResult && isCorrect;
                                            const showWrong = showResult && isSelected && !isCorrect;
                                            return (
                                              <button
                                                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${showCorrect
                                                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                                    : showWrong
                                                      ? "border-rose-300 bg-rose-50 text-rose-900"
                                                      : isSelected
                                                        ? "border-sky-300 bg-sky-50 text-sky-900"
                                                      : "border-amber-100 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/60"
                                                  }`}
                                                disabled={showResult}
                                                key={`${question.id}-${optionIndex}`}
                                                onClick={() => handleSelectQuizOption(summaryFileId, question.id, optionIndex)}
                                                type="button"
                                              >
                                                {option}
                                              </button>
                                            );
                                          })}
                                        </div>
                                        {showResult && question.explanation ? (
                                          <p className="mt-2 text-xs text-slate-600">Explanation: {question.explanation}</p>
                                        ) : null}
                                      </div>
                                    );
                                  })}

                                  {quizResultsByFileId[summaryFileId] ? (
                                    <p className="rounded-md bg-gradient-to-r from-amber-600 to-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm">
                                      Score: {quizResultsByFileId[summaryFileId].score} / {quizResultsByFileId[summaryFileId].total}
                                    </p>
                                  ) : null}

                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      type="button"
                                      className="bg-amber-700 text-white hover:bg-amber-800"
                                      onClick={() => handleSubmitQuiz(summaryFileId)}
                                    >
                                      Submit quiz
                                    </Button>
                                    <Button
                                      size="sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => handleResetQuiz(summaryFileId)}
                                    >
                                      Reset answers
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
            : null}
        </section>
      </div>

      <Dialog
        open={isAnnouncementModalOpen}
        onOpenChange={(open) => {
          if (isPostingAnnouncement) {
            return;
          }
          setIsAnnouncementModalOpen(open);
          if (!open) {
            resetAnnouncementComposer();
          }
        }}
      >
        <DialogContent className="max-w-lg!">
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
                rows={10}
                value={announcementBody}
                onChange={(event) => setAnnouncementBody(event.target.value)}
                className="h-28 resize"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Attachment (optional)</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-w-[100px] gap-2"
                  onClick={() => setAttachmentType("none")}
                  type="button"
                  variant={attachmentType === "none" ? "default" : "outline"}
                >
                  <CircleOffIcon className="size-4" />
                  None
                </Button>
                <Button
                  className="min-w-[100px] gap-2"
                  onClick={() => setAttachmentType("file")}
                  type="button"
                  variant={attachmentType === "file" ? "default" : "outline"}
                >
                  <PaperclipIcon className="size-4" />
                  File
                </Button>
                <Button
                  className="min-w-[100px] gap-2"
                  onClick={() => setAttachmentType("link")}
                  type="button"
                  variant={attachmentType === "link" ? "default" : "outline"}
                >
                  <Link2Icon className="size-4" />
                  Link
                </Button>
                <Button
                  className="min-w-[120px] gap-2"
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
                disabled={isPostingAnnouncement}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isPostingAnnouncement} type="submit">
                {isPostingAnnouncement && attachmentFile?.type === "application/pdf"
                  ? "Processing PDF..."
                  : isPostingAnnouncement
                    ? "Posting..."
                    : "Announce"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
