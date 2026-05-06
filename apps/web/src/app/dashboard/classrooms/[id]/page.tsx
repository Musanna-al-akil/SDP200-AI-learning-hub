/* eslint-disable @next/next/no-img-element */
"use client";

import {
  AlertCircleIcon,
  BookOpenTextIcon,
  BrainCircuitIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleOffIcon,
  CopyIcon,
  FileTextIcon,
  Link2Icon,
  Loader2Icon,
  MegaphoneIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  PlayCircleIcon,
  PlusIcon,
  SendHorizontalIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
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
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import { Textarea } from "@/components/shadcn/ui/textarea";
import {
  apiClient,
  type Classroom,
  type ClassroomAnnouncement,
  type ClassroomFile,
  type ClassroomMember,
  type FileChat,
  type FileQuiz,
  type FileSummary,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";

type AttachmentComposerType = "none" | "file" | "link" | "youtube";
type ReaderFile = {
  id: string;
  filename: string;
  title: string | null;
  content_type: string;
  processing_status: string;
};

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

function getAiEligibleFileId(attachment: ClassroomAnnouncement["attachment"]): string | null {
  if (attachment?.type !== "file" || !attachment.file) {
    return null;
  }
  if (attachment.file.content_type === "application/pdf") {
    return attachment.file.processing_status === "completed" ? attachment.file.id : null;
  }
  if (attachment.file.content_type.startsWith("image/")) {
    return attachment.file.id;
  }
  return null;
}

function getYoutubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();

    if (host.includes("youtu.be")) {
      const id = parsedUrl.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.includes("youtube.com")) {
      if (parsedUrl.pathname === "/watch") {
        const id = parsedUrl.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      if (parsedUrl.pathname.startsWith("/embed/")) {
        const id = parsedUrl.pathname.split("/").filter(Boolean)[1];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function ClassroomLoadingState() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </aside>
        <section className="space-y-4">
          <Skeleton className="h-16 rounded-xl" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton className="h-44 rounded-xl" key={index} />
          ))}
        </section>
      </div>
    </main>
  );
}

function EmptyStreamState({
  isCreator,
  onCreate,
}: {
  isCreator: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-100">
        <MegaphoneIcon className="size-6" />
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-slate-950">No announcements yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
        {isCreator
          ? "Share an update, PDF, image, link, or video to start the class stream."
          : "Announcements and shared materials will appear here once the creator posts them."}
      </p>
      {isCreator ? (
        <Button className="mt-5 gap-2" onClick={onCreate} type="button">
          <PlusIcon className="size-4" />
          New announcement
        </Button>
      ) : null}
    </div>
  );
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
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [isArchivingClassroom, setIsArchivingClassroom] = useState(false);
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  const [summaryByFileId, setSummaryByFileId] = useState<Record<string, FileSummary>>({});
  const [isSummaryLoadingByFileId, setIsSummaryLoadingByFileId] = useState<Record<string, boolean>>({});
  const [isSummaryGeneratingByFileId, setIsSummaryGeneratingByFileId] = useState<Record<string, boolean>>({});
  const [quizByFileId, setQuizByFileId] = useState<Record<string, FileQuiz>>({});
  const [isQuizLoadingByFileId, setIsQuizLoadingByFileId] = useState<Record<string, boolean>>({});
  const [isQuizGeneratingByFileId, setIsQuizGeneratingByFileId] = useState<Record<string, boolean>>({});
  const [quizAnswersByFileId, setQuizAnswersByFileId] = useState<Record<string, Record<string, number>>>({});
  const [quizResultsByFileId, setQuizResultsByFileId] = useState<Record<string, QuizResult>>({});
  const [imagePreviewUrlByFileId, setImagePreviewUrlByFileId] = useState<Record<string, string | null>>({});
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [readerFile, setReaderFile] = useState<ReaderFile | null>(null);
  const [readerPreviewUrl, setReaderPreviewUrl] = useState<string | null>(null);
  const [fileChatByFileId, setFileChatByFileId] = useState<Record<string, FileChat>>({});
  const [isFileChatLoadingByFileId, setIsFileChatLoadingByFileId] = useState<Record<string, boolean>>({});
  const [isFileChatAskingByFileId, setIsFileChatAskingByFileId] = useState<Record<string, boolean>>({});
  const [chatInputByFileId, setChatInputByFileId] = useState<Record<string, string>>({});
  const [hasCopiedClassCode, setHasCopiedClassCode] = useState(false);

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
    const imageFileIds = announcements
      .map((announcement) =>
        announcement.attachment?.type === "file" &&
          announcement.attachment.file?.content_type.startsWith("image/")
          ? announcement.attachment.file.id
          : null,
      )
      .filter((value): value is string => Boolean(value));

    const missingImageFileIds = imageFileIds.filter((fileId) => imagePreviewUrlByFileId[fileId] === undefined);
    if (missingImageFileIds.length === 0) {
      return;
    }

    let isCancelled = false;

    void Promise.all(
      missingImageFileIds.map(async (fileId) => {
        try {
          const result = await apiClient.getFileDownloadUrl(fileId);
          return [fileId, result.url] as const;
        } catch {
          return [fileId, null] as const;
        }
      }),
    ).then((entries) => {
      if (isCancelled) {
        return;
      }
      setImagePreviewUrlByFileId((previous) => {
        const next = { ...previous };
        for (const [fileId, previewUrl] of entries) {
          next[fileId] = previewUrl;
        }
        return next;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [announcements, imagePreviewUrlByFileId]);

  useEffect(() => {
    const summaryFileIds = announcements
      .map((announcement) => getAiEligibleFileId(announcement.attachment))
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
      .map((announcement) => getAiEligibleFileId(announcement.attachment))
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

  const handleOpenReaderChat = async (attachment: ClassroomAnnouncement["attachment"]) => {
    if (attachment?.type !== "file" || !attachment.file) {
      return;
    }
    const selectedFile: ReaderFile = {
      id: attachment.file.id,
      filename: attachment.file.filename,
      title: attachment.file.title,
      content_type: attachment.file.content_type,
      processing_status: attachment.file.processing_status,
    };
    setReaderFile(selectedFile);
    setIsReaderOpen(true);
    setReaderPreviewUrl(null);
    setIsFileChatLoadingByFileId((previous) => ({ ...previous, [selectedFile.id]: true }));

    try {
      const [download, chat] = await Promise.all([
        apiClient.getFileDownloadUrl(selectedFile.id),
        apiClient.getFileChat(selectedFile.id),
      ]);
      setReaderPreviewUrl(download.url);
      setFileChatByFileId((previous) => ({ ...previous, [selectedFile.id]: chat }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open reader";
      toast.error(message);
    } finally {
      setIsFileChatLoadingByFileId((previous) => ({ ...previous, [selectedFile.id]: false }));
    }
  };

  const handleAskFileChat = async (fileId: string) => {
    const message = (chatInputByFileId[fileId] ?? "").trim();
    if (!message) {
      return;
    }
    setIsFileChatAskingByFileId((previous) => ({ ...previous, [fileId]: true }));
    try {
      const chat = await apiClient.askFileChat(fileId, { message });
      setFileChatByFileId((previous) => ({ ...previous, [fileId]: chat }));
      setChatInputByFileId((previous) => ({ ...previous, [fileId]: "" }));
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Could not send message";
      toast.error(messageText);
    } finally {
      setIsFileChatAskingByFileId((previous) => ({ ...previous, [fileId]: false }));
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
    setIsArchivingClassroom(true);
    try {
      await apiClient.archiveClassroom(classroom.id);
      toast.success("Classroom archived");
      setIsArchiveConfirmOpen(false);
      router.replace("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Archive failed";
      toast.error(message);
    } finally {
      setIsArchivingClassroom(false);
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

  const handleCopyClassCode = async () => {
    if (!classroom?.join_code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(classroom.join_code);
      setHasCopiedClassCode(true);
      window.setTimeout(() => setHasCopiedClassCode(false), 1500);
      toast.success("Class code copied");
    } catch {
      toast.error("Could not copy class code");
    }
  };

  if (isLoading || !isAuthenticated || isLoadingPage) {
    return <ClassroomLoadingState />;
  }

  if (!classroom) {
    return (
      <main className="mx-auto flex min-h-[60svh] w-full max-w-3xl items-center justify-center px-4 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircleIcon className="mx-auto size-8 text-slate-500" />
          <h1 className="mt-4 text-xl font-semibold text-slate-950">Classroom not found</h1>
          <p className="mt-2 text-sm text-slate-600">The class may have been archived or you may no longer have access.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-enter mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 bg-[#f8f8f4] px-4 py-6 md:px-6">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-700 via-teal-800 to-slate-800 px-5 py-7 text-white shadow-sm md:px-6 md:py-8">
        <div className="absolute right-6 top-6 hidden rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium backdrop-blur sm:block">
          Stream
        </div>
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium capitalize text-white/90">
          <BookOpenTextIcon className="size-3.5" />
          {classroom.membership_role}
        </div>
        <h1 className="max-w-4xl text-3xl font-semibold tracking-tight md:text-4xl">{classroom.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-100/90">
          {classroom.description?.trim() || "Classroom stream for announcements and shared materials."}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Class code</p>
            <div className="flex items-center justify-between gap-3">
              <p className="mt-2 font-mono text-3xl font-semibold tracking-wide text-slate-700">{classroom.join_code}</p>
              <Button className="h-8 gap-1.5 px-2.5 outline-none" onClick={() => void handleCopyClassCode()} size="sm" type="button" variant="outline">
                {hasCopiedClassCode ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                {hasCopiedClassCode ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <UsersIcon className="size-4" />
              <p className="text-sm font-medium">People</p>
            </div>
            <p className="mt-2 text-sm text-slate-600">{activeMemberCount} active {activeMemberCount === 1 ? "member" : "members"}</p>
            <div className="mt-3 space-y-2">
              {members.map((member) => (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-2" key={member.user_id}>
                  <div className="min-w-0">
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
              <Input aria-label="Classroom name" value={name} onChange={(event) => setName(event.target.value)} />
              <Textarea aria-label="Classroom description" value={description} onChange={(event) => setDescription(event.target.value)} />
              <Button className="w-full" disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
              <Button className="w-full" onClick={handleRegenerateCode} type="button" variant="outline">
                Regenerate join code
              </Button>
              <Button
                className="w-full"
                onClick={() => setIsArchiveConfirmOpen(true)}
                type="button"
                variant="destructive"
              >
                Archive classroom
              </Button>
            </form>
          ) : null}
        </aside>

        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            {isCreator ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="px-1">
                  <p className="text-sm font-semibold text-slate-900">Class stream</p>
                  <p className="text-xs text-slate-500">Announcements, resources, and AI study tools</p>
                </div>
                <Button
                  className="h-10 w-full gap-2 rounded-full bg-sky-100 px-5 text-sky-800 hover:bg-sky-200 sm:w-fit"
                  onClick={() => setIsAnnouncementModalOpen(true)}
                  type="button"
                  variant="secondary"
                >
                  <PlusIcon className="size-4" />
                  New announcement
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1 rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-slate-800">Class stream</p>
                <p className="text-sm text-slate-500">Only classroom creators can post announcements.</p>
              </div>
            )}
          </div>

          {isLoadingAnnouncements ? (
            <div className="space-y-3">
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
            </div>
          ) : null}

          {!isLoadingAnnouncements && announcements.length === 0 ? (
            <EmptyStreamState isCreator={isCreator} onCreate={() => setIsAnnouncementModalOpen(true)} />
          ) : null}

          {!isLoadingAnnouncements
            ? announcements.map((announcement) => {
              const summaryFileId = getAiEligibleFileId(announcement.attachment);
              const isSummaryCompleted =
                summaryFileId !== null && summaryByFileId[summaryFileId]?.state === "completed";
              const isImageAttachment =
                announcement.attachment?.type === "file" &&
                Boolean(announcement.attachment.file?.content_type.startsWith("image/"));
              const imageFileId = isImageAttachment ? announcement.attachment?.file?.id ?? null : null;
              const imagePreviewUrl = imageFileId ? imagePreviewUrlByFileId[imageFileId] : null;
              const youtubeEmbedUrl = getYoutubeEmbedUrl(
                announcement.attachment?.type === "youtube" ? announcement.attachment.url : null,
              );

              return (
                <article className="stream-card rounded-xl border border-slate-200 bg-white shadow-sm" key={announcement.id}>
                  <div className="flex items-start gap-3 px-4 py-4">
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-700 text-sm font-semibold text-white ring-2 ring-sky-50">
                      <img src={"https://api.dicebear.com/9.x/adventurer/svg?seed=" + announcement.created_by_name} alt={announcement.created_by_name} className="size-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{announcement.created_by_name}</p>
                            <span className="text-xs text-slate-500">{formatPostedAt(announcement.created_at)}</span>
                          </div>
                        </div>
                        {summaryFileId && announcement.attachment?.type === "file" && announcement.attachment.file ? (
                          <Button
                            size="sm"
                            type="button"
                            className="h-8 shrink-0 gap-1.5 rounded-full border border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 to-rose-100 px-3 text-fuchsia-900 shadow-sm hover:from-fuchsia-100 hover:to-rose-200 hover:cursor-pointer"
                            variant="ghost"
                            onClick={() => {
                              void handleOpenReaderChat(announcement.attachment);
                            }}
                          >
                            <MessageSquareTextIcon className="size-3.5" />
                            Chat With Resource
                          </Button>
                        ) : null}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>

                      {announcement.attachment ? (
                        <div className="mt-3 space-y-2">
                          <button
                            className="interactive-lift flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
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
                                <FileTextIcon className="size-4" />
                              ) : announcement.attachment.type === "youtube" ? (
                                <PlayCircleIcon className="size-4" />
                              ) : (
                                <Link2Icon className="size-4" />
                              )}
                            </div>
                          </button>
                          {isImageAttachment && imagePreviewUrl ? (
                            <button
                              aria-label={`Open attached image: ${announcement.attachment?.title || announcement.attachment?.file?.filename || "Image"}`}
                              className="interactive-lift block w-full overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
                              onClick={() => {
                                void handleOpenAttachment(announcement);
                              }}
                              type="button"
                            >
                              <div className="aspect-video w-full bg-slate-100">
                                <img
                                  alt={announcement.attachment?.title || announcement.attachment?.file?.filename || "Announcement attachment"}
                                  className="h-full w-full object-cover"
                                  src={imagePreviewUrl}
                                />
                              </div>
                            </button>
                          ) : null}

                          {announcement.attachment?.type === "youtube" && youtubeEmbedUrl ? (
                            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                              <div className="aspect-video w-full bg-slate-100">
                                <iframe
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                  allowFullScreen
                                  className="h-full w-full"
                                  referrerPolicy="strict-origin-when-cross-origin"
                                  src={youtubeEmbedUrl}
                                  title={announcement.attachment.title || "YouTube video attachment"}
                                />
                              </div>
                            </div>
                          ) : null}

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
                                <span className="inline-flex items-center gap-1.5">
                                  <SparklesIcon className="size-3.5" />
                                  {summaryByFileId[summaryFileId]?.state === "completed"
                                    ? "Summary available"
                                    : "AI Summary"}
                                </span>
                                <ChevronDownIcon
                                  className={`size-4 transition group-open:rotate-180 ${isSummaryCompleted ? "text-sky-600" : "text-slate-500"
                                    }`}
                                />
                              </summary>
                              <div className="summary-open-content mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                                <div className="flex flex-wrap items-center gap-2">
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
                                <div className="mt-3 space-y-2">
                                  <Skeleton className="h-4 w-4/5" />
                                  <Skeleton className="h-4 w-2/3" />
                                </div>
                              ) : null}

                              {!isSummaryLoadingByFileId[summaryFileId] &&
                                !summaryByFileId[summaryFileId] ? (
                                <div className="mt-2 space-y-2">
                                  <p className="text-sm text-slate-500">Generate a summary when you want a quick study pass.</p>
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
                                  <p className="text-sm text-slate-500">No summary has been generated for this resource.</p>
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
                                <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-sm text-slate-600 ring-1 ring-sky-100">
                                  Summary generation is in progress.
                                </p>
                              ) : null}

                              {summaryByFileId[summaryFileId]?.state === "failed" ? (
                                <div className="mt-3 space-y-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                                  <p className="inline-flex items-center gap-2 text-sm text-rose-700">
                                    <AlertCircleIcon className="size-4" />
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
                                <span className="inline-flex items-center gap-1.5">
                                  <BrainCircuitIcon className="size-3.5" />
                                  {quizByFileId[summaryFileId]?.state === "completed" ? "Quiz available" : "AI Quiz"}
                                </span>
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
                                <div className="mt-3 space-y-2">
                                  <Skeleton className="h-4 w-3/4" />
                                  <Skeleton className="h-9 w-full rounded-md" />
                                  <Skeleton className="h-9 w-full rounded-md" />
                                </div>
                              ) : null}

                              {!isQuizLoadingByFileId[summaryFileId] && !quizByFileId[summaryFileId] ? (
                                <p className="mt-3 text-sm text-slate-600">Load or generate a quiz for this resource.</p>
                              ) : null}

                              {quizByFileId[summaryFileId]?.state === "empty" ? (
                                <p className="mt-3 text-sm text-slate-600">No quiz has been generated yet.</p>
                              ) : null}

                              {quizByFileId[summaryFileId]?.state === "pending" ? (
                                <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-sm text-slate-600 ring-1 ring-amber-100">
                                  Quiz generation is in progress.
                                </p>
                              ) : null}

                              {quizByFileId[summaryFileId]?.state === "failed" ? (
                                <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                                  <AlertCircleIcon className="size-4" />
                                  {quizByFileId[summaryFileId]?.error_message ?? "Quiz generation failed."}
                                </p>
                              ) : null}

                              {quizByFileId[summaryFileId]?.state === "completed" ? (
                                <div className="summary-open-content mt-3 space-y-4">
                                  <div className="flex flex-col gap-2 rounded-md bg-white/75 px-3 py-2 ring-1 ring-amber-100 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm font-semibold text-amber-950">
                                      {quizByFileId[summaryFileId]?.title ?? "Generated Quiz"}
                                    </p>
                                    <p className="text-xs font-medium text-amber-800">
                                      {quizByFileId[summaryFileId]?.questions.length ?? 0} questions
                                    </p>
                                  </div>

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
                                                className={`min-h-11 w-full rounded-md border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${showCorrect
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
                                    <p className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm">
                                      Score: {quizResultsByFileId[summaryFileId].score} / {quizResultsByFileId[summaryFileId].total}
                                    </p>
                                  ) : null}

                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <Button
                                      size="sm"
                                      type="button"
                                      className="bg-amber-700 text-white hover:bg-amber-800"
                                      disabled={Boolean(quizResultsByFileId[summaryFileId])}
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
        open={isArchiveConfirmOpen}
        onOpenChange={(open) => {
          if (isArchivingClassroom) {
            return;
          }
          setIsArchiveConfirmOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archive classroom?</DialogTitle>
            <DialogDescription>
              This will archive {classroom ? `"${classroom.name}"` : "this classroom"} and remove it from active classrooms.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isArchivingClassroom}
              onClick={() => setIsArchiveConfirmOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isArchivingClassroom} onClick={() => void handleArchive()} type="button" variant="destructive">
              {isArchivingClassroom ? "Archiving..." : "Archive classroom"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isReaderOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsReaderOpen(true);
            return;
          }
          setIsReaderOpen(false);
          setReaderFile(null);
          setReaderPreviewUrl(null);
        }}
      >
        <DialogContent className="flex h-[92vh] w-[96vw] max-w-6xl! flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{readerFile?.title || readerFile?.filename || "Reader"}</DialogTitle>
            <DialogDescription>Study the file and ask questions from the material.</DialogDescription>
          </DialogHeader>

          {!readerFile ? null : (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="space-y-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">
                  {readerFile.content_type === "application/pdf" ? "PDF document" : "Image attachment"}
                </p>
                {readerFile.content_type.startsWith("image/") && readerPreviewUrl ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <img
                      alt={readerFile.title || readerFile.filename}
                      className="max-h-[55vh] w-full object-contain"
                      src={readerPreviewUrl}
                    />
                  </div>
                ) : null}
                {readerFile.content_type === "application/pdf" ? (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-2">

                    {readerPreviewUrl ? (
                      <iframe
                        src={readerPreviewUrl}
                        title={readerFile.title || readerFile.filename}
                        className="h-[50vh] w-full rounded-md border border-slate-200 lg:h-[58vh]"
                      />
                    ) : (
                      <Skeleton className="h-[50vh] w-full rounded-md lg:h-[58vh]" />
                    )}
                    {readerPreviewUrl ? (
                      <Button
                        type="button"
                        onClick={() => {
                          window.open(readerPreviewUrl, "_blank", "noopener,noreferrer");
                        }}
                      >
                        Open PDF
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="flex h-full min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-sm font-medium text-slate-800">
                  <MessageSquareTextIcon className="size-4 text-violet-700" />
                  Document Chat
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                  {isFileChatLoadingByFileId[readerFile.id] ? (
                    <div className="space-y-2">
                      <Skeleton className="h-9 w-2/3 rounded-lg" />
                      <Skeleton className="ml-auto h-9 w-1/2 rounded-lg" />
                    </div>
                  ) : null}
                  {!isFileChatLoadingByFileId[readerFile.id] && !fileChatByFileId[readerFile.id] ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">No chat loaded yet.</p>
                  ) : null}
                  {fileChatByFileId[readerFile.id]?.state === "failed" ? (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {fileChatByFileId[readerFile.id]?.error_message || "Chat failed."}
                    </p>
                  ) : null}
                  {fileChatByFileId[readerFile.id]?.state === "empty" ? (
                    <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
                      Start by asking a question about this file.
                    </p>
                  ) : null}
                  {(fileChatByFileId[readerFile.id]?.messages ?? []).map((message) => (
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${
                        message.role === "user" ? "ml-8 bg-sky-100 text-sky-900" : "mr-8 bg-slate-100 text-slate-800"
                      }`}
                      key={message.id}
                    >
                      {message.role === "assistant" ? (
                        <div
                          className="overflow-x-auto leading-6
                          [&_a]:text-sky-700 [&_a]:underline
                          [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600
                          [&_code]:rounded [&_code]:bg-slate-200/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs
                          [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold
                          [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold
                          [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold
                          [&_li]:mb-1
                          [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
                          [&_p]:mb-2
                          [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-200/70 [&_pre]:p-2
                          [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left
                          [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1
                          [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-200/70 [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium
                          [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>
                  ))}
                  {isFileChatAskingByFileId[readerFile.id] ? (
                    <div className="mr-8 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        AI is thinking
                        <span className="inline-flex gap-1">
                          <span className="thinking-dot size-1.5 rounded-full bg-slate-500 [animation-delay:-0.2s]" />
                          <span className="thinking-dot size-1.5 rounded-full bg-slate-500 [animation-delay:-0.1s]" />
                          <span className="thinking-dot size-1.5 rounded-full bg-slate-500" />
                        </span>
                      </span>
                    </div>
                  ) : null}
                </div>
                <form
                  className="border-t border-slate-200 bg-slate-50/70 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleAskFileChat(readerFile.id);
                  }}
                >
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ask a question about this file..."
                      value={chatInputByFileId[readerFile.id] ?? ""}
                      onChange={(event) =>
                        setChatInputByFileId((previous) => ({ ...previous, [readerFile.id]: event.target.value }))
                      }
                      disabled={Boolean(isFileChatAskingByFileId[readerFile.id])}
                    />
                    <Button
                      aria-label="Send message"
                      className="min-w-10"
                      type="submit"
                      disabled={Boolean(isFileChatAskingByFileId[readerFile.id])}
                    >
                      {isFileChatAskingByFileId[readerFile.id] ? (
                        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <SendHorizontalIcon className="size-4" />
                      )}
                    </Button>
                  </div>
                </form>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
        <DialogContent className="max-h-[92vh] max-w-lg! overflow-auto">
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
