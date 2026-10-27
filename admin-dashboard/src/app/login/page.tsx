"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
const router = useRouter();

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [error, setError] = useState("");
const [loading, setLoading] = useState(false);

async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
event.preventDefault();

setError("");
setLoading(true);

try {
  const { data, error: loginError } =
    await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

  if (loginError || !data.user) {
    setError("Invalid email or password.");
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    await supabase.auth.signOut();
    setError("You are not authorized to access the admin dashboard.");
    return;
  }

  router.replace("/dashboard");
} catch {
  setError("Unable to log in. Please try again.");
} finally {
  setLoading(false);
}

}

return ( <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-5 py-10 text-white"> <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101622] p-8 shadow-2xl sm:p-10"> <div className="mb-8 text-center"> <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10"> <svg
           viewBox="0 0 24 24"
           fill="none"
           stroke="currentColor"
           strokeWidth="1.7"
           className="h-8 w-8 text-emerald-400"
           aria-hidden="true"
         > <path d="M4 20V8l8-4 8 4v12" /> <path d="M2 20h20M9 20v-6h6v6M8 9h.01M16 9h.01" /> </svg> </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">
        Turf Management
      </p>

      <h1 className="text-3xl font-bold tracking-tight">
        Admin Login
      </h1>

      <p className="mt-3 text-sm leading-6 text-slate-400">
        Sign in to manage your turfs, bookings, pricing, and availability.
      </p>
    </div>

    <form onSubmit={handleLogin} className="space-y-5">
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-slate-300"
        >
          Email address
        </label>

        <input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="admin@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="w-full rounded-xl border border-white/10 bg-[#080d16] px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-medium text-slate-300"
        >
          Password
        </label>

        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="w-full rounded-xl border border-white/10 bg-[#080d16] px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-emerald-400 px-4 py-3.5 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Sign In to Dashboard"}
      </button>
    </form>

    <p className="mt-8 text-center text-xs leading-5 text-slate-500">
      Authorized administrators only.
      <br />
      Your turf management portal
    </p>
  </section>
</main>

);
}
