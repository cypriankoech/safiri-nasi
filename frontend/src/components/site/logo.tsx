import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The logo's black lettering disappears on dark surfaces, so it always sits on a cream badge there. */
export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex shrink-0 items-center", className)} aria-label="Safiri Nasi home">
      <span
        className={cn(
          "inline-flex items-center rounded-2xl",
          onDark ? "bg-[#fbf6ec] px-2 py-1" : "dark:bg-[#fbf6ec] dark:px-2 dark:py-1",
        )}
      >
        <Image
          src="/brand/logo.png"
          alt="Safiri Nasi Tour & Travel"
          width={465}
          height={381}
          preload
          className="h-12 w-auto sm:h-14"
        />
      </span>
    </Link>
  );
}
