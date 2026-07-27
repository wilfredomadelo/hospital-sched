"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { homeForRole } from "@/lib/session";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";

export const loginAction = async (
  _prev: { error?: string } | undefined,
  formData: FormData,
) => {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  const { auth } = await import("@/lib/auth");
  const session = await auth();
  const role = (session?.user?.role ?? "NURSE") as Role;
  redirect(homeForRole(role));
};

export const logoutAction = async () => {
  await signOut({ redirectTo: "/login" });
};
