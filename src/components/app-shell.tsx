import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

export const AppShell = ({
  title,
  nav,
  userName,
  userRole,
  children,
}: {
  title: string;
  nav: NavItem[];
  userName: string;
  userRole: string;
  children: React.ReactNode;
}) => (
  <div className="min-h-screen">
    <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
            Hospital Sched
          </p>
          <h1 className="font-display text-xl font-bold text-slate-900">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>
            {userName} · {userRole}
          </span>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
      <nav
        className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3"
        aria-label="Primary"
      >
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600",
            )}
            tabIndex={0}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
    <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
  </div>
);
