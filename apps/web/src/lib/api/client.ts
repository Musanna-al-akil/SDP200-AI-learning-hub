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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
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

export const apiClient = {
  getHealth: () => requestJson<HealthResponse>("/health"),
};
