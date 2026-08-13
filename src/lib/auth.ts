import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authSecret = process.env.AUTH_SECRET;
if (!authSecret) {
  console.warn(
    "[auth] AUTH_SECRET is missing. Set it in .env / Vercel env vars.",
  );
}

const isJwtSessionNoise = (error: Error) => {
  const name = error.name ?? "";
  const message = error.message ?? "";
  const type = (error as Error & { type?: string }).type ?? "";
  return (
    name === "JWTSessionError" ||
    type === "JWTSessionError" ||
    message.includes("no matching decryption secret") ||
    message.includes("JWTSessionError")
  );
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  logger: {
    error(error) {
      // Stale cookie after AUTH_SECRET change — expected, not an app bug
      if (isJwtSessionNoise(error)) return;
      console.error("[auth][error]", error);
    },
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
  trustHost: true,
});

/** Safe session read — never throws on bad JWT */
export const getSession = async () => {
  try {
    return (await auth()) ?? null;
  } catch (error) {
    if (error instanceof Error && isJwtSessionNoise(error)) return null;
    return null;
  }
};
