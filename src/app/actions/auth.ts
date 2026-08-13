"use server";

import { AuthError } from "next-auth";
import { signIn, signOut, getSession } from "@/lib/auth";
import { clearAuthCookiesAction } from "@/app/actions/clear-auth";
import { homeForRole } from "@/lib/session";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";

export const loginAction = async (
  _prev: { error?: string } | undefined,
  formData: FormData,
) => {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // Drop cookies encrypted with an old AUTH_SECRET before issuing a new session
  await clearAuthCookiesAction();

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

  const session = await getSession();
  const role = (session?.user?.role ?? "NURSE") as Role;
  redirect(homeForRole(role));
};

export const logoutAction = async () => {
  await signOut({ redirectTo: "/login" });
};
