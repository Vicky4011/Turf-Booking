"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PricingSummary from "./PricingSummary";

export default function DashboardPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");

  const verifyAdmin = useCallback(async () => {
    setCheckingAuth(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || profile?.role !== "admin") {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setAdminEmail(user.email ?? "");
    } catch (error) {
      console.error("Admin verification failed:", error);
      router.replace("/login");
    } finally {
      setCheckingAuth(false);
    }
  }, [router]);

  useEffect(() => {
    void verifyAdmin();
  }, [verifyAdmin]);

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout failed:", error.message);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-emerald-400" />

          <p className="mt-4 text-sm text-gray-400">
            Verifying administrator access...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Top navigation */}
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
              Turf Booking
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              Admin Dashboard
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {adminEmail && (
              <span className="hidden text-sm text-gray-400 sm:block">
                {adminEmail}
              </span>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:border-red-500 hover:bg-red-500/10 hover:text-red-400"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        {/* Welcome */}
        <section className="mb-8">
          <p className="text-sm text-emerald-400">
            Administration
          </p>

          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            Manage your turfs
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
            Manage turf details, opening hours, blocked slots, and
            independent hourly pricing from one dashboard.
          </p>
        </section>

        {/* Management cards */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Turf Management */}
          <Link
            href="/turfs"
            className="group rounded-2xl border border-gray-800 bg-gray-900 p-6 transition hover:-translate-y-1 hover:border-emerald-500/60 hover:bg-gray-900/80"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl">
              🏟️
            </div>

            <h3 className="mt-5 text-xl font-bold">
              Turf Management
            </h3>

            <p className="mt-2 text-sm leading-6 text-gray-400">
              Add turfs, update their details, manage locations, and
              activate or deactivate turfs.
            </p>

            <span className="mt-5 inline-block font-semibold text-emerald-400 transition group-hover:translate-x-1">
              Manage Turfs →
            </span>
          </Link>

          {/* Slot Management */}
          <Link
            href="/slots"
            className="group rounded-2xl border border-gray-800 bg-gray-900 p-6 transition hover:-translate-y-1 hover:border-sky-500/60 hover:bg-gray-900/80"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-2xl">
              🕒
            </div>

            <h3 className="mt-5 text-xl font-bold">
              Slot Management
            </h3>

            <p className="mt-2 text-sm leading-6 text-gray-400">
              Configure weekly opening hours and block individual
              dates and hourly slots.
            </p>

            <span className="mt-5 inline-block font-semibold text-sky-400 transition group-hover:translate-x-1">
              Manage Slots →
            </span>
          </Link>

          {/* Pricing Management */}
          <Link
            href="/pricing"
            className="group rounded-2xl border border-gray-800 bg-gray-900 p-6 transition hover:-translate-y-1 hover:border-amber-500/60 hover:bg-gray-900/80"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-2xl">
              💰
            </div>

            <h3 className="mt-5 text-xl font-bold">
              Pricing Management
            </h3>

            <p className="mt-2 text-sm leading-6 text-gray-400">
              Set separate hourly prices for daytime, nighttime,
              weekdays, and weekends for each turf.
            </p>

            <span className="mt-5 inline-block font-semibold text-amber-400 transition group-hover:translate-x-1">
              Manage Pricing →
            </span>
          </Link>
        </section>

        {/* Individual pricing for every turf */}
        <PricingSummary />

        {/* Footer */}
        <footer className="mt-10 border-t border-gray-800 pt-5 text-center text-xs text-gray-500">
          Turf Booking Admin Dashboard
        </footer>
      </div>
    </main>
  );
}