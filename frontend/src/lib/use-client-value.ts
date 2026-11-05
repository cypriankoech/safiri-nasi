"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Read a value that depends on the visitor's clock or browser only after hydration.
 * Under Cache Components, `new Date()` during prerender would freeze the build-time value.
 */
export function useClientValue<T>(getValue: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, getValue, () => serverValue);
}
