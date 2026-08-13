import { logoutAction } from "@/app/actions/auth";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1920px] items-center gap-3 px-3 py-1.5 lg:px-4">
        <div className="flex shrink-0 items-baseline gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            Hospital Sched
          </p>
          <h1 className="font-display text-sm font-bold text-slate-900">
            {title}
          </h1>
        </div>
        <AppNav nav={nav} />
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
          <span className="hidden sm:inline">
            {userName} · {userRole}
          </span>
          <ThemeToggle />
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
    <main className="mx-auto w-full max-w-[1920px] px-3 py-3 lg:px-4">
      {children}
    </main>
  </div>
);
