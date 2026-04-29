import { appConfig } from "./config";

export type ApiErrorShape = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiClientError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = "sdp_auth_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit, hasJsonBody = true): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };

  if (hasJsonBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const raw = await response.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const maybeError = (data ?? {}) as ApiErrorShape;
    const message =
      maybeError.error?.message ??
      (raw ? raw.slice(0, 240) : `Request failed with status ${response.status}`);
    throw new ApiClientError(message, response.status, maybeError.error?.code);
  }

  return data as T;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init, true);
}

async function requestFormData<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init, false);
}

export type HealthResponse = {
  status: string;
  service: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
};

export type AuthResponse = {
  user: AuthUser;
  token: string;
};

export type Classroom = {
  id: string;
  name: string;
  description: string | null;
  creator_id: string;
  creator_name: string;
  membership_role: "creator" | "member";
  join_code: string;
  created_at: string;
};

export type ClassroomListResponse = {
  classrooms: Classroom[];
};

export type ClassroomMember = {
  user_id: string;
  role: "creator" | "member";
  status: "active" | "removed";
  name: string;
  email: string;
};

export type ClassroomMembersResponse = {
  members: ClassroomMember[];
};

export type ClassroomFile = {
  id: string;
  classroom_id: string;
  filename: string;
  title: string | null;
  content_type: string;
  size_bytes: number;
  processing_status: string;
  processing_error: string | null;
  created_at: string;
};

export type ClassroomFilesResponse = {
  files: ClassroomFile[];
};

export type FileSummaryState = "empty" | "pending" | "completed" | "failed";

export type FileSummary = {
  state: FileSummaryState;
  summary_id: string | null;
  file_id: string;
  content: string | null;
  error_message: string | null;
  provider: string | null;
  model: string | null;
  updated_at: string | null;
};

export type FileQuizState = "empty" | "pending" | "completed" | "failed";

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_option_index: number;
  explanation: string | null;
  position: number;
};

export type FileQuiz = {
  state: FileQuizState;
  quiz_id: string | null;
  file_id: string;
  title: string | null;
  questions: QuizQuestion[];
  error_message: string | null;
  provider: string | null;
  model: string | null;
  updated_at: string | null;
};

export type AnnouncementAttachmentFile = {
  id: string;
  filename: string;
  title: string | null;
  content_type: string;
  size_bytes: number;
  processing_status: string;
  processing_error: string | null;
};

export type AnnouncementAttachment = {
  type: "file" | "link" | "youtube";
  title: string | null;
  file?: AnnouncementAttachmentFile | null;
  url?: string | null;
};

export type ClassroomAnnouncement = {
  id: string;
  classroom_id: string;
  created_by_id: string;
  created_by_name: string;
  body: string;
  attachment: AnnouncementAttachment | null;
  created_at: string;
};

export type ClassroomAnnouncementsResponse = {
  announcements: ClassroomAnnouncement[];
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type UpdateMePayload = {
  name?: string;
  current_password?: string;
  new_password?: string;
};

export type CreateClassroomPayload = {
  name: string;
  description?: string;
};

export type UpdateClassroomPayload = {
  name?: string;
  description?: string;
};

export const apiClient = {
  getHealth: () => requestJson<HealthResponse>("/health"),
  register: (payload: RegisterPayload) =>
    requestJson<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload: LoginPayload) =>
    requestJson<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () =>
    requestJson<{ success: boolean }>("/auth/logout", {
      method: "POST",
    }),
  me: () => requestJson<AuthUser>("/auth/me"),
  updateMe: (payload: UpdateMePayload) =>
    requestJson<AuthUser>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  listClassrooms: () => requestJson<ClassroomListResponse>("/classrooms"),
  createClassroom: (payload: CreateClassroomPayload) =>
    requestJson<Classroom>("/classrooms", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  joinClassroom: (joinCode: string) =>
    requestJson<{ classroom: Classroom; membership: { id: string; role: string; status: string } }>(
      "/classrooms/join",
      {
        method: "POST",
        body: JSON.stringify({ join_code: joinCode }),
      },
    ),
  getClassroom: (classroomId: string) => requestJson<Classroom>(`/classrooms/${classroomId}`),
  updateClassroom: (classroomId: string, payload: UpdateClassroomPayload) =>
    requestJson<Classroom>(`/classrooms/${classroomId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  archiveClassroom: (classroomId: string) =>
    requestJson<{ success: boolean }>(`/classrooms/${classroomId}`, {
      method: "DELETE",
    }),
  regenerateJoinCode: (classroomId: string) =>
    requestJson<Classroom>(`/classrooms/${classroomId}/regenerate-join-code`, {
      method: "POST",
    }),
  listClassroomMembers: (classroomId: string) =>
    requestJson<ClassroomMembersResponse>(`/classrooms/${classroomId}/members`),
  removeClassroomMember: (classroomId: string, memberUserId: string) =>
    requestJson<{ success: boolean }>(`/classrooms/${classroomId}/members/${memberUserId}`, {
      method: "DELETE",
    }),
  listClassroomFiles: (classroomId: string) =>
    requestJson<ClassroomFilesResponse>(`/classrooms/${classroomId}/files`),
  listClassroomAnnouncements: (classroomId: string) =>
    requestJson<ClassroomAnnouncementsResponse>(`/classrooms/${classroomId}/announcements`),
  createClassroomAnnouncement: (classroomId: string, payload: {
    body: string;
    attachmentType?: "file" | "link" | "youtube";
    attachmentTitle?: string;
    attachmentUrl?: string;
    file?: File;
  }) => {
    const formData = new FormData();
    formData.append("body", payload.body.trim());
    if (payload.attachmentType) {
      formData.append("attachment_type", payload.attachmentType);
    }
    if (payload.attachmentTitle?.trim()) {
      formData.append("attachment_title", payload.attachmentTitle.trim());
    }
    if (payload.attachmentUrl?.trim()) {
      formData.append("attachment_url", payload.attachmentUrl.trim());
    }
    if (payload.file) {
      formData.append("file", payload.file);
    }
    return requestFormData<ClassroomAnnouncement>(`/classrooms/${classroomId}/announcements`, {
      method: "POST",
      body: formData,
    });
  },
  getFile: (fileId: string) => requestJson<ClassroomFile>(`/files/${fileId}`),
  getFileDownloadUrl: (fileId: string) => requestJson<{ url: string }>(`/files/${fileId}/download`),
  getFileSummary: (fileId: string) => requestJson<FileSummary>(`/files/${fileId}/summary`),
  generateFileSummary: (fileId: string, payload?: { regenerate?: boolean }) =>
    requestJson<FileSummary>(`/files/${fileId}/summary`, {
      method: "POST",
      body: JSON.stringify({ regenerate: Boolean(payload?.regenerate) }),
    }),
  getFileQuiz: (fileId: string) => requestJson<FileQuiz>(`/files/${fileId}/quiz`),
  generateFileQuiz: (fileId: string, payload?: { regenerate?: boolean; questionCount?: number }) =>
    requestJson<FileQuiz>(`/files/${fileId}/quiz`, {
      method: "POST",
      body: JSON.stringify({
        regenerate: Boolean(payload?.regenerate),
        question_count: payload?.questionCount ?? 5,
      }),
    }),
};
