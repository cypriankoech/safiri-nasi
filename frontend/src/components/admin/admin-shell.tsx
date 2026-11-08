"use client";

import {
  BarChart3,
  BookOpenText,
  CalendarRange,
  CreditCard,
  ExternalLink,
  FileClock,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquareQuote,
  Moon,
  Settings,
  Shapes,
  Sun,
  Tag,
  Ticket,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSession, useTheme } from "@/components/providers";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  {
    group: "Operations",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/bookings", label: "Bookings", icon: Ticket },
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/departures", label: "Departures", icon: CalendarRange },
      { href: "/admin/enquiries", label: "Enquiries", icon: Inbox },
      { href: "/admin/customers", label: "Customers", icon: Users },
    ],
  },
  {
    group: "Catalogue",
    items: [
      { href: "/admin/tours", label: "Tours", icon: Map },
      { href: "/admin/destinations", label: "Destinations", icon: Shapes },
      { href: "/admin/promos", label: "Promo codes", icon: Tag },
      { href: "/admin/reviews", label: "Reviews", icon: MessageSquareQuote },
      { href: "/admin/blog", label: "Blog", icon: BookOpenText },
      { href: "/admin/faqs", label: "FAQs", icon: HelpCircle },
    ],
  },
  {
    group: "Business",
    items: [
      { href: "/admin/reports", label: "Reports", icon: BarChart3 },
      { href: "/admin/users", label: "Team", icon: UserCog, adminOnly: true },
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/admin/audit", label: "Audit log", icon: FileClock, adminOnly: true },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, setUser } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  if (!loading && (!user || user.role === "customer")) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
        <div>
          <h1 className="text-2xl font-extrabold">Staff access only</h1>
          <p className="mt-1 text-muted">{user ? "Your account doesn't have admin access." : "Please log in with your staff account."}</p>
          <Link href="/login?next=/admin" className="mt-5 inline-flex h-11 items-center rounded-full bg-lime px-6 font-bold text-forest-deep">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
  };

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Admin">
      {NAV.map((section) => (
        <div key={section.group}>
          <p className="px-3 pb-2 text-[11px] font-bold tracking-widest text-white/40 uppercase">{section.group}</p>
          <ul className="space-y-0.5">
            {section.items
              .filter((i) => !("adminOnly" in i && i.adminOnly) || user?.role === "admin")
              .map((item) => {
                const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                        active ? "bg-lime text-forest-deep" : "text-white/75 hover:bg-white/10 hover:text-white",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon className="h-4.5 w-4.5" /> {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-forest-deep text-white transition-transform md:sticky md:top-0 md:h-dvh md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="rounded-xl bg-[#fbf6ec] px-1.5 py-1">
              <Image src="/brand/logo.png" alt="Safiri Nasi" width={465} height={381} className="h-9 w-auto" />
            </span>
            <span className="text-sm leading-tight font-bold">
              Safiri Nasi
              <span className="block text-xs font-normal text-white/50">Admin</span>
            </span>
          </Link>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        {nav}
        <div className="border-t border-white/10 p-3 text-sm">
          <Link href="/" target="_blank" className="flex items-center gap-3 rounded-xl px-3 py-2 text-white/75 hover:bg-white/10">
            <ExternalLink className="h-4 w-4" /> View website
          </Link>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-white/75 hover:bg-white/10"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {theme === "dark" ? "Light" : "Dark"} mode
          </button>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-white/75 hover:bg-white/10">
            <LogOut className="h-4 w-4" /> Log out
          </button>
          {user && (
            <p className="mt-2 truncate px-3 text-xs text-white/40">
              {user.full_name} · {user.role}
            </p>
          )}
        </div>
      </aside>
      {open && <button className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} aria-label="Close menu" />}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur md:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-bold">Safiri Nasi Admin</span>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
