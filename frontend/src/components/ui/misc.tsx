import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingStatus, PaymentStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/format";

const BADGE_TONES = {
  neutral: "bg-surface-2 text-muted",
  green: "bg-success-bg text-success",
  sun: "bg-warning-bg text-warning",
  red: "bg-danger-bg text-danger",
  forest: "bg-forest text-white dark:bg-lime dark:text-forest-deep",
  lime: "bg-lime text-forest-deep",
  maroon: "bg-maroon text-white",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const BOOKING_TONES: Record<BookingStatus, BadgeTone> = {
  pending_payment: "sun",
  confirmed: "green",
  fully_paid: "forest",
  completed: "neutral",
  cancelled: "red",
  expired: "neutral",
  refunded: "red",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={BOOKING_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

const PAYMENT_TONES: Record<PaymentStatus, BadgeTone> = {
  pending: "neutral",
  processing: "sun",
  success: "green",
  failed: "red",
  cancelled: "neutral",
  refunded: "red",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_TONES[status]}>{status === "success" ? "Paid" : status}</Badge>;
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl border border-border bg-surface", className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-3/70", className)} aria-hidden />;
}

export function Stars({ rating, size = 14, className }: { rating: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          width={size}
          height={size}
          className={i <= Math.round(rating) ? "fill-sun text-sun" : "text-border"}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  className,
  action,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        align === "center" && "items-center text-center md:flex-col md:items-center",
        className,
      )}
    >
      <div className={cn(align === "center" && "mx-auto max-w-2xl")}>
        {eyebrow && <p className="font-hand text-xl text-sun-strong dark:text-sun">{eyebrow}</p>}
        <h2 className="text-3xl font-extrabold text-primary md:text-4xl">{title}</h2>
        {subtitle && <p className="mt-2 max-w-2xl text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-border bg-surface/60 p-10 text-center", className)}>
      {icon && <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-2">{icon}</div>}
      <p className="text-lg font-bold">{title}</p>
      {children && <div className="mt-1 text-muted">{children}</div>}
    </div>
  );
}

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}
