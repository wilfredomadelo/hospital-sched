import { getSession } from "@/lib/auth";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";

export const requireSession = async () => {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session;
};

export const requireRole = async (roles: Role[]) => {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) {
    if (session.user.role === "NURSE") redirect("/nurse");
    redirect("/admin");
  }
  return session;
};

export const homeForRole = (role: Role) => {
  if (role === "NURSE") return "/nurse";
  return "/admin";
};
