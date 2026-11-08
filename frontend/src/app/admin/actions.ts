"use server";

import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { CATALOG_TAG } from "@/lib/server-api";

const API_URL = process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Expire the cached public catalogue after staff edit tours, destinations or content. */
export async function refreshCatalog(): Promise<void> {
  const jar = await cookies();
  const access = jar.get("sn_access")?.value;
  if (!access) return;
  const res = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" });
  if (!res.ok) return;
  const user = (await res.json()) as { role: string };
  if (user.role === "customer") return;
  updateTag(CATALOG_TAG);
}
