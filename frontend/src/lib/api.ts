"use client";

// Browser-side API client. Requests go to /api/* on this origin and are rewritten
// to FastAPI (next.config.ts), so the httpOnly session cookies are first-party.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = {
  method?: string;
  body?: unknown;
  bookingToken?: string | null;
  form?: FormData;
  retry?: boolean;
};

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  }
  return fallback;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.bookingToken) headers["X-Booking-Token"] = opts.bookingToken;

  const res = await fetch(path.startsWith("/") ? path : `/api/${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: "include",
  });

  if (res.status === 401 && opts.retry !== false && !path.startsWith("/api/auth/")) {
    if (await refreshSession()) return api<T>(path, { ...opts, retry: false });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, `Request failed (${res.status})`));
  return data as T;
}

// Guest access tokens per booking, kept so travellers can come back to "Manage booking".
const TOKENS_KEY = "sn_booking_tokens";

export const bookingTokens = {
  all(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "{}");
    } catch {
      return {};
    }
  },
  get(ref: string): string | null {
    return this.all()[ref.toUpperCase()] ?? null;
  },
  set(ref: string, token: string) {
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify({ ...this.all(), [ref.toUpperCase()]: token }));
    } catch {
      /* storage unavailable */
    }
  },
};
