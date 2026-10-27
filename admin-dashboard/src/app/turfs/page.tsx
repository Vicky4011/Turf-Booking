"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Turf = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  price_per_hour: number;
  is_active: boolean;
};

type TurfForm = {
  name: string;
  description: string;
  location: string;
  price_per_hour: string;
};

const emptyForm: TurfForm = {
  name: "",
  description: "",
  location: "",
  price_per_hour: "",
};

export default function TurfManagementPage() {
  const router = useRouter();

  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [form, setForm] = useState<TurfForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTurfs = useCallback(async () => {
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      router.replace("/login");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin") {
      await supabase.auth.signOut();
      router.replace("/login");
      return;
    }

    const { data, error: queryError } = await supabase
      .from("turfs")
      .select(
        "id, name, description, location, price_per_hour, is_active"
      )
      .order("created_at", { ascending: false });

    if (queryError) {
      throw new Error(queryError.message);
    }

    setTurfs(data ?? []);
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        await loadTurfs();
      } catch {
        if (mounted) {
          setError("Unable to load turfs. Please refresh the page.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [loadTurfs]);

  function updateField(field: keyof TurfForm, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function startEditing(turf: Turf) {
    setEditingId(turf.id);

    setForm({
      name: turf.name,
      description: turf.description ?? "",
      location: turf.location ?? "",
      price_per_hour: String(turf.price_per_hour),
    });

    setError("");
    setSuccess("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setSuccess("");
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const price = Number(form.price_per_hour);

    if (!form.name.trim()) {
      setError("Please enter the turf name.");
      return;
    }

    if (
      !form.price_per_hour.trim() ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setError("Enter a valid hourly price.");
      return;
    }

    setSaving(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        router.replace("/login");
        return;
      }

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

      const turfData = {
        name: form.name.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        price_per_hour: price,
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from("turfs")
          .update({
            ...turfData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        setSuccess("Turf details updated successfully.");
      } else {
        const { error: insertError } = await supabase
          .from("turfs")
          .insert(turfData);

        if (insertError) {
          throw new Error(insertError.message);
        }

        setSuccess("New turf added successfully.");
      }

      setForm(emptyForm);
      setEditingId(null);

      await loadTurfs();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save turf details."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleTurf(turf: Turf) {
    const action = turf.is_active ? "deactivate" : "activate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} "${turf.name}"?`
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        router.replace("/login");
        return;
      }

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

      const { error: updateError } = await supabase
        .from("turfs")
        .update({
          is_active: !turf.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", turf.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setSuccess(
        `${turf.name} has been ${action}d successfully.`
      );

      await loadTurfs();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to change turf status."
      );
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080b12] text-slate-300">
        Loading turf management...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080b12] text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <Link
            href="/dashboard"
            className="text-sm text-emerald-400 hover:text-emerald-300"
            >
            ← Back to Dashboard
        </Link>

        <div className="mt-6 mb-8">
        <h1 className="text-3xl font-bold">Turf Management</h1>

        <p className="mt-2 text-slate-400">
            Manage your turfs, update details, and control their availability.
        </p>
      </div>
        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Total Turfs"
            value={turfs.length}
          />

          <SummaryCard
            title="Active Turfs"
            value={turfs.filter((t) => t.is_active).length}
          />

          <SummaryCard
            title="Inactive Turfs"
            value={turfs.filter((t) => !t.is_active).length}
          />
        </section>

        <section className="mb-8 rounded-2xl border border-white/10 bg-[#101622] p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">
              {editingId ? "Edit Turf" : "Add New Turf"}
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Enter the turf details and hourly pricing.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300"
            >
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Turf Name">
                <input
                  value={form.name}
                  onChange={(e) =>
                    updateField("name", e.target.value)
                  }
                  placeholder="e.g. Vicky Sports Arena"
                  required
                  maxLength={120}
                  className={inputClass}
                />
              </FormField>

              <FormField label="Location">
                <input
                  value={form.location}
                  onChange={(e) =>
                    updateField("location", e.target.value)
                  }
                  placeholder="Area, city"
                  maxLength={250}
                  className={inputClass}
                />
              </FormField>

              <FormField label="Hourly Price (₹)">
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  value={form.price_per_hour}
                  onChange={(e) =>
                    updateField(
                      "price_per_hour",
                      e.target.value
                    )
                  }
                  placeholder="e.g. 1000"
                  required
                  className={inputClass}
                />
              </FormField>

              <FormField label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    updateField("description", e.target.value)
                  }
                  placeholder="Describe your turf and facilities"
                  maxLength={2000}
                  rows={3}
                  className={inputClass}
                />
              </FormField>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Add Turf"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-white/10 px-6 py-3 text-sm hover:bg-white/5"
                >
                  Cancel Editing
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#101622] p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">
              Registered Turfs
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Edit details or control whether each turf is active.
            </p>
          </div>

          {turfs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-5 py-12 text-center">
              <div className="text-4xl">🏟️</div>

              <h3 className="mt-4 font-semibold">
                No turfs registered
              </h3>

              <p className="mt-2 text-sm text-slate-400">
                Add your first turf using the form above.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {turfs.map((turf) => (
                <article
                  key={turf.id}
                  className="rounded-xl border border-white/10 bg-[#080d16] p-5"
                >
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold">
                          {turf.name}
                        </h3>

                        <span
                          className={`rounded-full px-3 py-1 text-xs ${
                            turf.is_active
                              ? "bg-emerald-400/10 text-emerald-400"
                              : "bg-white/5 text-slate-400"
                          }`}
                        >
                          {turf.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-slate-400">
                        📍 {turf.location || "Location not provided"}
                      </p>

                      {turf.description && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">
                          {turf.description}
                        </p>
                      )}

                      <p className="mt-4 text-xl font-bold">
                        ₹
                        {Number(
                          turf.price_per_hour
                        ).toLocaleString("en-IN")}
                        <span className="text-sm font-normal text-slate-400">
                          {" "}/ hour
                        </span>
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(turf)}
                        className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleTurf(turf)}
                        className={`rounded-lg px-4 py-2 text-sm ${
                          turf.is_active
                            ? "border border-red-500/30 text-red-300 hover:bg-red-500/10"
                            : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                        }`}
                      >
                        {turf.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#080d16] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400";

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101622] p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}