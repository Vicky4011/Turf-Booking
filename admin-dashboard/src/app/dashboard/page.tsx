"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Turf = {
  id: string;
  name: string;
  location: string | null;
  price_per_hour: number;
  is_active: boolean;
};

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [bookingCount, setBookingCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        // Verify that a user is logged in.
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError || !authData.user) {
          router.replace("/login");
          return;
        }

        // Verify administrator permissions.
        const { data: profile, error: profileError } =
          await supabase
            .from("profiles")
            .select("role")
            .eq("id", authData.user.id)
            .maybeSingle();

        if (profileError || profile?.role !== "admin") {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        // Load turf information and booking statistics.
        const [
          turfResult,
          activeBookingResult,
          pendingBookingResult,
        ] = await Promise.all([
          supabase
            .from("turfs")
            .select(
              "id, name, location, price_per_hour, is_active"
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .in("status", ["requested", "confirmed"]),

          supabase
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .eq("status", "requested"),
        ]);

        if (
          turfResult.error ||
          activeBookingResult.error ||
          pendingBookingResult.error
        ) {
          throw new Error("Unable to load dashboard data.");
        }

        if (!mounted) return;

        setEmail(authData.user.email ?? "");
        setTurfs(turfResult.data ?? []);
        setBookingCount(activeBookingResult.count ?? 0);
        setPendingCount(pendingBookingResult.count ?? 0);
      } catch {
        if (mounted) {
          setError(
            "Unable to load dashboard information. Please refresh."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080b12] text-slate-300">
        Checking administrator access...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080b12] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#101622]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
              Turf Management
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              Admin Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-400 sm:inline">
              {email}
            </span>

            <button
              onClick={handleLogout}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm transition hover:bg-white/5"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        {/* Welcome */}
        <section className="mb-8">
          <p className="text-sm text-emerald-400">
            Welcome back!
          </p>

          <h2 className="mt-2 text-3xl font-bold">
            Overview
          </h2>

          <p className="mt-2 text-slate-400">
            Manage your turfs, bookings, and availability.
          </p>
        </section>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {/* Statistics */}
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total Turfs"
            value={turfs.length}
            description="Registered turfs"
          />

          <StatCard
            title="Active Bookings"
            value={bookingCount}
            description="Requested and confirmed"
          />

          <StatCard
            title="Pending Requests"
            value={pendingCount}
            description="Awaiting your confirmation"
          />
        </section>

        {/* Turf list */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-[#101622] p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                Your Turfs
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Your registered turf facilities.
              </p>
            </div>

            <span className="rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-400">
              {turfs.filter((turf) => turf.is_active).length} Active
            </span>
          </div>

          {turfs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-5 py-12 text-center">
              <div className="text-4xl">🏟️</div>

              <h3 className="mt-4 text-lg font-semibold">
                No turfs added yet
              </h3>

              <p className="mt-2 text-sm text-slate-400">
                Your turfs will appear here once you add them.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {turfs.map((turf) => (
                <div
                  key={turf.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#080d16] p-4"
                >
                  <div>
                    <h3 className="font-semibold">
                      {turf.name}
                    </h3>

                    <p className="mt-1 text-sm text-slate-400">
                      {turf.location || "Location not provided"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold">
                      ₹
                      {Number(
                        turf.price_per_hour
                      ).toLocaleString("en-IN")}
                      <span className="text-sm font-normal text-slate-400">
                        {" "}/ hour
                      </span>
                    </p>

                    <span
                      className={`mt-1 inline-block text-xs ${
                        turf.is_active
                          ? "text-emerald-400"
                          : "text-slate-500"
                      }`}
                    >
                      {turf.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming features */}
        <section className="mt-8">
          <h2 className="mb-4 text-xl font-semibold">
            Management Tools
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon="🏟️"
              title="Turf Management"
              description="Add turfs and update their details and pricing."
            />

            <FeatureCard
              icon="📅"
              title="Slot Management"
              description="Manage operating hours and block unavailable slots."
            />

            <FeatureCard
              icon="📋"
              title="Booking Management"
              description="Review WhatsApp requests and confirm reservations."
            />
          </div>
        </section>

        <footer className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-slate-500">
          Turf Booking · Admin Portal
        </footer>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101622] p-6">
      <p className="text-sm text-slate-400">{title}</p>

      <p className="mt-3 text-4xl font-bold">{value}</p>

      <p className="mt-2 text-sm text-slate-500">
        {description}
      </p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101622] p-5 transition hover:border-emerald-400/30">
      <div className="text-2xl">{icon}</div>

      <h3 className="mt-4 font-semibold">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-400">
        {description}
      </p>

      <span className="mt-4 inline-block rounded-md bg-white/5 px-2 py-1 text-xs text-slate-500">
        Coming next
      </span>
    </div>
  );
}