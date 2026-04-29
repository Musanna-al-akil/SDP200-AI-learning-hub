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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();

  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
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

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
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
};
