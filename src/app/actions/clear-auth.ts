"use server";

import { cookies } from "next/headers";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
];

/** Clears Auth.js cookies (e.g. after AUTH_SECRET change). Safe in Server Actions. */
export const clearAuthCookiesAction = async () => {
  const jar = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    jar.delete(name);
  }
};
