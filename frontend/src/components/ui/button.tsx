import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "bg-accent text-accent-fg hover:brightness-95 shadow-sm",
  dark: "bg-forest text-white hover:bg-forest-deep dark:bg-lime dark:text-forest-deep dark:hover:brightness-95",
  sun: "bg-sun text-forest-deep hover:bg-sun-strong",
  outline: "border border-border bg-surface text-text hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-110",
  link: "text-primary underline-offset-4 hover:underline px-0",
} as const;

const SIZES = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
  icon: "h-10 w-10",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

type Common = {
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  loading?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function buttonClass({ variant = "primary", size = "md", className }: Omit<Common, "children" | "loading">) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:pointer-events-none disabled:opacity-55 cursor-pointer select-none whitespace-nowrap",
    VARIANTS[variant],
    variant !== "link" && SIZES[size],
    className,
  );
}

export function Button({
  variant,
  size,
  loading,
  className,
  children,
  disabled,
  ...props
}: Common & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={buttonClass({ variant, size, className })} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  children,
  href,
  ...props
}: Common & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const external = href.startsWith("http");
  if (external) {
    return (
      <a href={href} className={buttonClass({ variant, size, className })} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClass({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
