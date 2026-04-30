const rawApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export const appConfig = {
  apiBaseUrl: rawApiBaseUrl.replace(/\/+$/, ""),
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Aura Classroom",
  appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
} as const;
