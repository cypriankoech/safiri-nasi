"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Phone,
  Search,
  Sun,
  Ticket,
  User as UserIcon,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useIsDark, usePrefs, useSession, useTheme } from "@/components/providers";
import { buttonClass } from "@/components/ui/button";
import { api } from "@/lib/api";
import { REGION_LABELS } from "@/lib/format";
import type { SiteInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

type Props = Pick<SiteInfo, "categories" | "destinations"> & { phone: string; announcement: string };

const LINKS = [
  { href: "/deals", label: "Deals" },
  { href: "/tailor-made", label: "Tailor-made" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Header({ categories, destinations, phone, announcement }: Props) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<"destinations" | "tours" | null>(null);
  // Close any open menu once a link inside the header is followed.
  const closeOnLink = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) {
      setOpen(false);
      setMenu(null);
    }
  };

  const byRegion = (["kenya", "africa", "international"] as const).map((region) => ({
    region,
    items: destinations.filter((d) => d.region === region),
  }));

  return (
    <header className="sticky top-0 z-40" onClickCapture={closeOnLink}>
      {announcement && (
        <div className="bg-sun px-4 py-1.5 text-center text-sm font-semibold text-forest-deep">{announcement}</div>
      )}
      <div className="border-b border-border/70 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
            <MegaTrigger label="Destinations" active={menu === "destinations"} onOpen={(o) => setMenu(o ? "destinations" : null)}>
              <div className="grid grid-cols-3 gap-8">
                {byRegion.map(({ region, items }) => (
                  <div key={region}>
                    <p className="mb-3 text-xs font-bold tracking-widest text-olive uppercase">{REGION_LABELS[region]}</p>
                    <ul className="space-y-1.5">
                      {items.map((d) => (
                        <li key={d.slug}>
                          <Link href={`/destinations/${d.slug}`} className="text-sm hover:text-lime-strong dark:hover:text-lime">
                            {d.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <Link href="/destinations" className="mt-5 inline-block text-sm font-semibold text-primary">
                All destinations →
              </Link>
            </MegaTrigger>
            <MegaTrigger label="Tours" active={menu === "tours"} onOpen={(o) => setMenu(o ? "tours" : null)}>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                {categories.map((c) => (
                  <Link key={c.slug} href={`/tours?category=${c.slug}`} className="group rounded-xl p-2 hover:bg-surface-2">
                    <span className="block text-sm font-semibold group-hover:text-lime-strong dark:group-hover:text-lime">{c.name}</span>
                    <span className="line-clamp-1 text-xs text-muted">{c.description}</span>
                  </Link>
                ))}
              </div>
              <Link href="/tours" className="mt-4 inline-block text-sm font-semibold text-primary">
                Browse all tours →
              </Link>
            </MegaTrigger>
            {LINKS.map((l) => (
              <Suspense key={l.href} fallback={<NavLink href={l.href} label={l.label} />}>
                <ActiveNavLink href={l.href} label={l.label} />
              </Suspense>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/tours" className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Search tours">
              <Search className="h-5 w-5" />
            </Link>
            <CurrencySwitch />
            <AccountMenu />
            <a href={`tel:${phone.replace(/\s/g, "")}`} className={buttonClass({ variant: "dark", size: "sm", className: "hidden xl:inline-flex" })}>
              <Phone className="h-4 w-4" /> {phone}
            </a>
            <button
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2 lg:hidden"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label="Menu"
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-b border-border bg-bg lg:hidden">
          <nav className="mx-auto max-w-7xl space-y-6 px-4 py-5" aria-label="Mobile">
            <div className="grid grid-cols-2 gap-2">
              {[{ href: "/tours", label: "All tours" }, { href: "/destinations", label: "Destinations" }, ...LINKS, { href: "/booking", label: "Manage booking" }, { href: "/faq", label: "FAQs" }].map((l) => (
                <Link key={l.href} href={l.href} className="rounded-xl bg-surface px-4 py-3 font-semibold">
                  {l.label}
                </Link>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold tracking-widest text-olive uppercase">Trip styles</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Link key={c.slug} href={`/tours?category=${c.slug}`} className="rounded-full border border-border px-3 py-1.5 text-sm">
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
            <a href={`tel:${phone.replace(/\s/g, "")}`} className={buttonClass({ variant: "dark", className: "w-full" })}>
              <Phone className="h-4 w-4" /> Call {phone}
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function MegaTrigger({
  label,
  active,
  onOpen,
  children,
}: {
  label: string;
  active: boolean;
  onOpen: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    onOpen(true);
  };
  const hide = () => {
    timer.current = setTimeout(() => onOpen(false), 120);
  };
  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        className={cn(
          "flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold hover:bg-surface-2",
          active && "bg-surface-2",
        )}
        aria-expanded={active}
        onClick={() => onOpen(!active)}
        onKeyDown={(e) => e.key === "Escape" && onOpen(false)}
      >
        {label} <ChevronDown className={cn("h-4 w-4 transition", active && "rotate-180")} />
      </button>
      {active && (
        <div className="absolute top-full left-0 z-50 mt-2 w-[min(640px,80vw)] rounded-2xl border border-border bg-surface p-6 shadow-soft">
          {children}
        </div>
      )}
    </div>
  );
}

function CurrencySwitch() {
  const { currency, setPrefs } = usePrefs();
  return (
    <div className="hidden items-center rounded-full border border-border p-0.5 text-xs font-bold sm:flex" role="group" aria-label="Currency">
      {(["KES", "USD"] as const).map((c) => (
        <button
          key={c}
          onClick={() => setPrefs({ currency: c, rate: c === "USD" ? "non_resident" : "resident" })}
          className={cn("rounded-full px-2.5 py-1", currency === c ? "bg-forest text-white dark:bg-lime dark:text-forest-deep" : "text-muted")}
          aria-pressed={currency === c}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function AccountMenu() {
  const { user } = useSession();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const client = useQueryClient();

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    client.setQueryData(["me"], null);
    setOpen(false);
    router.push("/");
  };

  const isDark = useIsDark();
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {user ? (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-lime text-sm font-bold text-forest-deep">
            {user.full_name[0]}
          </span>
        ) : (
          <UserIcon className="h-5 w-5" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-border bg-surface p-2 text-sm shadow-soft">
          {user ? (
            <p className="px-3 py-2 text-muted">
              Signed in as <span className="font-semibold text-text">{user.full_name}</span>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 p-1">
              <Link href="/login" className={buttonClass({ variant: "dark", size: "sm" })}>
                Log in
              </Link>
              <Link href="/register" className={buttonClass({ variant: "outline", size: "sm" })}>
                Sign up
              </Link>
            </div>
          )}
          <MenuLink href="/booking" icon={<Ticket className="h-4 w-4" />}>
            Manage a booking
          </MenuLink>
          {user && (
            <MenuLink href="/account" icon={<UserIcon className="h-4 w-4" />}>
              My trips
            </MenuLink>
          )}
          {user && user.role !== "customer" && (
            <MenuLink href="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>
              Admin panel
            </MenuLink>
          )}
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-surface-2"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {isDark ? "Light mode" : "Dark mode"}
          </button>
          {user && (
            <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-danger hover:bg-surface-2">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-surface-2">
      {icon} {children}
    </Link>
  );
}

function NavLink({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-3.5 py-2 text-sm font-semibold hover:bg-surface-2",
        active && "text-lime-strong dark:text-lime",
      )}
    >
      {label}
    </Link>
  );
}

function ActiveNavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  return <NavLink href={href} label={label} active={pathname.startsWith(href)} />;
}
