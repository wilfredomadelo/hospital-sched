import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/session";

const nurseNav = [
  { href: "/nurse", label: "My schedule" },
  { href: "/nurse/leave", label: "Leave" },
  { href: "/nurse/notifications", label: "Notifications" },
];

export default async function NurseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["NURSE"]);

  return (
    <AppShell
      title="Nurse portal"
      nav={nurseNav}
      userName={session.user.name}
      userRole={session.user.role}
    >
      {children}
    </AppShell>
  );
}
