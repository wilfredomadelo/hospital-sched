"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

const isActive = (pathname: string, href: string) => {
  if (href === "/admin" || href === "/nurse") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
};

export const AppNav = ({ nav }: { nav: NavItem[] }) => {
  const pathname = usePathname();

  return (
    <nav
      className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto"
      aria-label="Primary"
    >
      {nav.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600",
              active
                ? "bg-teal-50 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200"
                : "text-slate-600 hover:bg-teal-50 hover:text-teal-800 dark:hover:bg-teal-900/50 dark:hover:text-teal-200",
            )}
            aria-current={active ? "page" : undefined}
            tabIndex={0}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};
