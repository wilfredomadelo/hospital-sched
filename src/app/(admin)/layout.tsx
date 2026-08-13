import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/session";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/roster", label: "Roster" },
  { href: "/admin/schedule-types", label: "Types" },
  { href: "/admin/holidays", label: "Holidays" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/units", label: "Units" },
  { href: "/admin/leave", label: "Leave" },
  { href: "/admin/compliance", label: "Compliance" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["ADMIN", "SUPERVISOR"]);

  return (
    <AppShell
      title="Operations"
      nav={adminNav}
      userName={session.user.name}
      userRole={session.user.role}
    >
      {children}
    </AppShell>
  );
}
