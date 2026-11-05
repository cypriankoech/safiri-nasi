"use client";

import { useClientValue } from "@/lib/use-client-value";

let year: number | undefined;
const getYear = () => (year ??= new Date().getFullYear());

export function CurrentYear() {
  return <>{useClientValue(getYear, null)}</>;
}
