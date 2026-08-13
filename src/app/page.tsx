import Link from "next/link";
import { getSession } from "@/lib/auth";
import { homeForRole } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getSession();
  if (session?.user?.role) redirect(homeForRole(session.user.role));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
        Workforce
      </p>
      <h1 className="font-display mt-2 text-4xl font-bold text-slate-900 md:text-5xl">
        Hospital Nurse Scheduling
      </h1>
      <p className="mt-4 max-w-xl text-lg text-slate-600">
        Plan shifts, track compliance, and give nurses a clear view of their
        roster.
      </p>
      <div className="mt-8">
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-md bg-teal-700 px-6 text-sm font-medium text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          aria-label="Sign in to Hospital Nurse Scheduling"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
