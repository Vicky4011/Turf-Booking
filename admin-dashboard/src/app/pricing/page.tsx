"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Turf = {
  id: string;
  name: string;
};

type PricingRow = {
  id?: string;
  turf_id: string;
  day_type: "weekday" | "weekend";
  period_type: "daytime" | "nighttime";
  price_per_hour: number;
};

type PricingForm = {
  weekdayDay: string;
  weekdayNight: string;
  weekendDay: string;
  weekendNight: string;
  daytimeStart: string;
  daytimeEnd: string;
  nighttimeStart: string;
  nighttimeEnd: string;
};

const DEFAULT_FORM: PricingForm = {
  weekdayDay: "800",
  weekdayNight: "1000",
  weekendDay: "1000",
  weekendNight: "1200",
  daytimeStart: "06:00",
  daytimeEnd: "18:00",
  nighttimeStart: "18:00",
  nighttimeEnd: "06:00",
};

const EMPTY_PRICES = {
  weekdayDay: null as number | null,
  weekdayNight: null as number | null,
  weekendDay: null as number | null,
  weekendNight: null as number | null,
};

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatPrice(value: string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount) || value.trim() === "") {
    return "₹0";
  }

  return `₹${amount.toLocaleString("en-IN")}`;
}

function PricingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedTurf = searchParams.get("turf");

  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [selectedTurf, setSelectedTurf] = useState("");
  const [form, setForm] = useState<PricingForm>(DEFAULT_FORM);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [savedPrices, setSavedPrices] = useState(EMPTY_PRICES);

  // --------------------------------------------------
  // Authenticate the administrator and load turfs
  // --------------------------------------------------

  const loadTurfs = useCallback(async () => {
    setLoading(true);
    setError("");

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

      const { data, error: turfError } = await supabase
        .from("turfs")
        .select("id, name")
        .order("name");

      if (turfError) throw turfError;

      const turfList = (data ?? []) as Turf[];

      setTurfs(turfList);

      setSelectedTurf((current) => {
        if (
          requestedTurf &&
          turfList.some((turf) => turf.id === requestedTurf)
        ) {
          return requestedTurf;
        }

        if (current && turfList.some((turf) => turf.id === current)) {
          return current;
        }

        return turfList[0]?.id ?? "";
      });
    } catch (err) {
      console.error("Failed to load turfs:", err);

      setError(
        err instanceof Error ? err.message : "Failed to load turfs."
      );
    } finally {
      setLoading(false);
    }
  }, [router, requestedTurf]);

  useEffect(() => {
    void loadTurfs();
  }, [loadTurfs]);

  // --------------------------------------------------
  // Load prices for the selected turf
  // --------------------------------------------------

  const loadPricing = useCallback(async () => {
    if (!selectedTurf) {
      setForm({ ...DEFAULT_FORM });
      setSavedPrices({ ...EMPTY_PRICES });
      return;
    }

    setError("");
    setSuccess("");

    try {
      const { data, error: pricingError } = await supabase
        .from("turf_pricing")
        .select("id, turf_id, day_type, period_type, price_per_hour")
        .eq("turf_id", selectedTurf);

      if (pricingError) throw pricingError;

      const rows = (data ?? []) as PricingRow[];

      const updatedForm: PricingForm = { ...DEFAULT_FORM };

      const prices = {
        ...EMPTY_PRICES,
      };

      for (const row of rows) {
        const price = Number(row.price_per_hour);

        if (!Number.isFinite(price)) continue;

        if (
          row.day_type === "weekday" &&
          row.period_type === "daytime"
        ) {
          updatedForm.weekdayDay = String(price);
          prices.weekdayDay = price;
        } else if (
          row.day_type === "weekday" &&
          row.period_type === "nighttime"
        ) {
          updatedForm.weekdayNight = String(price);
          prices.weekdayNight = price;
        } else if (
          row.day_type === "weekend" &&
          row.period_type === "daytime"
        ) {
          updatedForm.weekendDay = String(price);
          prices.weekendDay = price;
        } else if (
          row.day_type === "weekend" &&
          row.period_type === "nighttime"
        ) {
          updatedForm.weekendNight = String(price);
          prices.weekendNight = price;
        }
      }

      setForm(updatedForm);
      setSavedPrices(prices);
    } catch (err) {
      console.error("Failed to load pricing:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load saved pricing."
      );
    }
  }, [selectedTurf]);

  useEffect(() => {
    if (selectedTurf) {
      void loadPricing();
    }
  }, [selectedTurf, loadPricing]);

  // --------------------------------------------------
  // Handle form changes
  // --------------------------------------------------

  function updateForm<K extends keyof PricingForm>(
    field: K,
    value: PricingForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setSuccess("");
    setError("");
  }

  // --------------------------------------------------
  // Validate and save prices for the selected turf
  // --------------------------------------------------

  async function savePricing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!selectedTurf) {
      setError("Please select a turf.");
      return;
    }

    const priceFields = [
      { label: "Weekday daytime", value: form.weekdayDay },
      { label: "Weekday nighttime", value: form.weekdayNight },
      { label: "Weekend daytime", value: form.weekendDay },
      { label: "Weekend nighttime", value: form.weekendNight },
    ];

    for (const field of priceFields) {
      const amount = Number(field.value);

      if (
        field.value.trim() === "" ||
        !Number.isFinite(amount) ||
        amount < 0
      ) {
        setError(
          `${field.label} price must be a valid number greater than or equal to zero.`
        );
        return;
      }
    }

    if (
      form.daytimeStart === form.daytimeEnd ||
      form.nighttimeStart === form.nighttimeEnd
    ) {
      setError(
        "Daytime and nighttime must each have a valid, non-zero duration."
      );
      return;
    }

    // Require daytime to end when nighttime starts.
    if (form.daytimeEnd !== form.nighttimeStart) {
      setError(
        "Daytime end must match nighttime start so the periods connect."
      );
      return;
    }

    // Require nighttime to end when daytime starts.
    // This supports periods that cross midnight.
    if (form.nighttimeEnd !== form.daytimeStart) {
      setError(
        "Nighttime end must match daytime start so the periods cover a full day."
      );
      return;
    }

    setSaving(true);

    try {
      const rows = [
        {
          turf_id: selectedTurf,
          day_type: "weekday" as const,
          period_type: "daytime" as const,
          price_per_hour: Number(form.weekdayDay),
        },
        {
          turf_id: selectedTurf,
          day_type: "weekday" as const,
          period_type: "nighttime" as const,
          price_per_hour: Number(form.weekdayNight),
        },
        {
          turf_id: selectedTurf,
          day_type: "weekend" as const,
          period_type: "daytime" as const,
          price_per_hour: Number(form.weekendDay),
        },
        {
          turf_id: selectedTurf,
          day_type: "weekend" as const,
          period_type: "nighttime" as const,
          price_per_hour: Number(form.weekendNight),
        },
      ];

      const { error: saveError } = await supabase
        .from("turf_pricing")
        .upsert(rows, {
          onConflict: "turf_id,day_type,period_type",
        });

      if (saveError) throw saveError;

      setSavedPrices({
        weekdayDay: Number(form.weekdayDay),
        weekdayNight: Number(form.weekdayNight),
        weekendDay: Number(form.weekendDay),
        weekendNight: Number(form.weekendNight),
      });

      setSuccess(
        `Pricing saved successfully for ${
          turfs.find((turf) => turf.id === selectedTurf)?.name ??
          "the selected turf"
        }.`
      );
    } catch (err) {
      console.error("Failed to save pricing:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to save pricing. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // Loading screen
  // --------------------------------------------------

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-emerald-400" />

          <p className="mt-4 text-sm text-gray-400">
            Loading pricing management...
          </p>
        </div>
      </main>
    );
  }

  // --------------------------------------------------
  // Pricing management UI
  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-emerald-400 hover:text-emerald-300"
            >
              ← Back to Dashboard
            </Link>

            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              Pricing Management
            </h1>

            <p className="mt-2 text-sm text-gray-400">
              Configure independent hourly prices for every turf.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadPricing()}
            disabled={!selectedTurf || saving}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800 disabled:opacity-50"
          >
            Reload Saved Prices
          </button>
        </header>

        {/* Alerts */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-sm text-emerald-300"
          >
            {success}
          </div>
        )}

        {/* No turfs */}
        {turfs.length === 0 ? (
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center">
            <h2 className="text-xl font-semibold">
              No turfs found
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Create a turf before setting its prices.
            </p>

            <Link
              href="/turfs"
              className="mt-5 inline-block rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-gray-950 hover:bg-emerald-400"
            >
              Add a Turf
            </Link>
          </section>
        ) : (
          <>
            {/* Turf selection */}
            <section className="mb-6 rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <label
                htmlFor="turf"
                className="mb-2 block text-sm font-semibold text-gray-200"
              >
                Select Turf
              </label>

              <select
                id="turf"
                value={selectedTurf}
                onChange={(event) => {
                  const turfId = event.target.value;

                  setSelectedTurf(turfId);

                  const params = new URLSearchParams(
                    searchParams.toString()
                  );

                  if (turfId) {
                    params.set("turf", turfId);
                  } else {
                    params.delete("turf");
                  }

                  router.replace(`/pricing?${params.toString()}`, {
                    scroll: false,
                  });
                }}
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500 sm:max-w-md"
              >
                {turfs.map((turf) => (
                  <option key={turf.id} value={turf.id}>
                    {turf.name}
                  </option>
                ))}
              </select>

              <p className="mt-3 text-xs text-gray-500">
                Prices saved here apply only to the selected turf.
              </p>
            </section>

            {/* Period configuration */}
            <section className="mb-6 rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="text-xl font-bold">
                Time Period Configuration
              </h2>

              <p className="mt-2 text-sm text-gray-400">
                Set when daytime ends and nighttime begins. These
                periods must connect and cover the full 24-hour day.
              </p>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {/* Daytime */}
                <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-2xl">☀️</span>

                    <div>
                      <h3 className="font-semibold text-amber-300">
                        Daytime
                      </h3>

                      <p className="text-xs text-gray-400">
                        Daytime pricing hours
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="daytimeStart"
                        className="mb-2 block text-xs text-gray-400"
                      >
                        Start Time
                      </label>

                      <input
                        id="daytimeStart"
                        type="time"
                        value={form.daytimeStart}
                        onChange={(event) =>
                          updateForm("daytimeStart", event.target.value)
                        }
                        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-3 text-white outline-none focus:border-amber-500"
                        required
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="daytimeEnd"
                        className="mb-2 block text-xs text-gray-400"
                      >
                        End Time
                      </label>

                      <input
                        id="daytimeEnd"
                        type="time"
                        value={form.daytimeEnd}
                        onChange={(event) =>
                          updateForm("daytimeEnd", event.target.value)
                        }
                        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-3 text-white outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Nighttime */}
                <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-2xl">🌙</span>

                    <div>
                      <h3 className="font-semibold text-indigo-300">
                        Nighttime
                      </h3>

                      <p className="text-xs text-gray-400">
                        Nighttime pricing hours
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="nighttimeStart"
                        className="mb-2 block text-xs text-gray-400"
                      >
                        Start Time
                      </label>

                      <input
                        id="nighttimeStart"
                        type="time"
                        value={form.nighttimeStart}
                        onChange={(event) =>
                          updateForm("nighttimeStart", event.target.value)
                        }
                        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-3 text-white outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="nighttimeEnd"
                        className="mb-2 block text-xs text-gray-400"
                      >
                        End Time
                      </label>

                      <input
                        id="nighttimeEnd"
                        type="time"
                        value={form.nighttimeEnd}
                        onChange={(event) =>
                          updateForm("nighttimeEnd", event.target.value)
                        }
                        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-3 text-white outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-gray-800 bg-gray-950 p-4 text-sm text-gray-400">
                <p>
                  <span className="font-semibold text-amber-300">
                    Daytime:
                  </span>{" "}
                  {form.daytimeStart} – {form.daytimeEnd}
                </p>

                <p className="mt-2">
                  <span className="font-semibold text-indigo-300">
                    Nighttime:
                  </span>{" "}
                  {form.nighttimeStart} – {form.nighttimeEnd}
                </p>

                <p className="mt-3 text-xs text-gray-500">
                  These time boundaries currently exist only in this
                  form. They are not persisted to Supabase by this
                  implementation.
                </p>
              </div>
            </section>

            {/* Pricing form */}
            <form onSubmit={savePricing}>
              <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                <div className="mb-6">
                  <h2 className="text-xl font-bold">
                    Hourly Pricing
                  </h2>

                  <p className="mt-2 text-sm text-gray-400">
                    Set four independent hourly prices for{" "}
                    <span className="font-semibold text-white">
                      {turfs.find(
                        (turf) => turf.id === selectedTurf
                      )?.name ?? "the selected turf"}
                    </span>
                    .
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  {/* Weekday daytime */}
                  <PriceInput
                    id="weekdayDay"
                    title="Weekday Daytime"
                    description="Monday to Friday"
                    icon="☀️"
                    color="emerald"
                    value={form.weekdayDay}
                    onChange={(value) =>
                      updateForm("weekdayDay", value)
                    }
                    savedPrice={savedPrices.weekdayDay}
                    timeRange={`${form.daytimeStart} – ${form.daytimeEnd}`}
                  />

                  {/* Weekday nighttime */}
                  <PriceInput
                    id="weekdayNight"
                    title="Weekday Nighttime"
                    description="Monday to Friday"
                    icon="🌙"
                    color="indigo"
                    value={form.weekdayNight}
                    onChange={(value) =>
                      updateForm("weekdayNight", value)
                    }
                    savedPrice={savedPrices.weekdayNight}
                    timeRange={`${form.nighttimeStart} – ${form.nighttimeEnd}`}
                  />

                  {/* Weekend daytime */}
                  <PriceInput
                    id="weekendDay"
                    title="Weekend Daytime"
                    description="Saturday and Sunday"
                    icon="☀️"
                    color="sky"
                    value={form.weekendDay}
                    onChange={(value) =>
                      updateForm("weekendDay", value)
                    }
                    savedPrice={savedPrices.weekendDay}
                    timeRange={`${form.daytimeStart} – ${form.daytimeEnd}`}
                  />

                  {/* Weekend nighttime */}
                  <PriceInput
                    id="weekendNight"
                    title="Weekend Nighttime"
                    description="Saturday and Sunday"
                    icon="🌙"
                    color="purple"
                    value={form.weekendNight}
                    onChange={(value) =>
                      updateForm("weekendNight", value)
                    }
                    savedPrice={savedPrices.weekendNight}
                    timeRange={`${form.nighttimeStart} – ${form.nighttimeEnd}`}
                  />
                </div>

                {/* Price summary */}
                <div className="mt-8 rounded-xl border border-gray-800 bg-gray-950 p-5">
                  <h3 className="font-semibold text-white">
                    Pricing Summary
                  </h3>

                  <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <SummaryItem
                      label="Weekday Day"
                      value={formatPrice(form.weekdayDay)}
                    />

                    <SummaryItem
                      label="Weekday Night"
                      value={formatPrice(form.weekdayNight)}
                    />

                    <SummaryItem
                      label="Weekend Day"
                      value={formatPrice(form.weekendDay)}
                    />

                    <SummaryItem
                      label="Weekend Night"
                      value={formatPrice(form.weekendNight)}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => void loadPricing()}
                    disabled={saving}
                    className="rounded-lg border border-gray-700 px-5 py-3 text-sm font-semibold text-gray-300 transition hover:bg-gray-800 disabled:opacity-50"
                  >
                    Reset to Saved Prices
                  </button>

                  <button
                    type="submit"
                    disabled={saving || !selectedTurf}
                    className="rounded-lg bg-emerald-500 px-6 py-3 text-sm font-bold text-gray-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving Prices..." : "Save Pricing"}
                  </button>
                </div>
              </section>
            </form>
          </>
        )}

        <footer className="mt-8 border-t border-gray-800 pt-5 text-center text-xs text-gray-500">
          Turf Booking · Pricing Management
        </footer>
      </div>
    </main>
  );
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-emerald-400" />
            <p className="mt-4 text-sm text-gray-400">
              Loading pricing management...
            </p>
          </div>
        </main>
      }
    >
      <PricingPageContent />
    </Suspense>
  );
}

// --------------------------------------------------
// Reusable price input
// --------------------------------------------------

type PriceInputProps = {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: "emerald" | "indigo" | "sky" | "purple";
  value: string;
  onChange: (value: string) => void;
  savedPrice: number | null;
  timeRange: string;
};

function PriceInput({
  id,
  title,
  description,
  icon,
  color,
  value,
  onChange,
  savedPrice,
  timeRange,
}: PriceInputProps) {
  const borderColors = {
    emerald: "border-emerald-900/60",
    indigo: "border-indigo-900/60",
    sky: "border-sky-900/60",
    purple: "border-purple-900/60",
  };

  const textColors = {
    emerald: "text-emerald-400",
    indigo: "text-indigo-400",
    sky: "text-sky-400",
    purple: "text-purple-400",
  };

  const focusColors = {
    emerald: "focus:border-emerald-500",
    indigo: "focus:border-indigo-500",
    sky: "focus:border-sky-500",
    purple: "focus:border-purple-500",
  };

  return (
    <div
      className={`rounded-xl border ${borderColors[color]} bg-gray-950/70 p-5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{icon}</span>

          <div>
            <h3 className="font-semibold text-white">{title}</h3>

            <p className="mt-1 text-xs text-gray-400">
              {description}
            </p>

            <p className={`mt-2 text-xs ${textColors[color]}`}>
              {timeRange}
            </p>
          </div>
        </div>

        <span className="text-xs text-gray-500">Per hour</span>
      </div>

      <label
        htmlFor={id}
        className="mb-2 mt-5 block text-sm text-gray-400"
      >
        Hourly Price (₹)
      </label>

      <div className="flex items-center rounded-lg border border-gray-700 bg-gray-900 px-4 focus-within:border-emerald-500">
        <span className="text-lg font-semibold text-gray-400">₹</span>

        <input
          id={id}
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full bg-transparent px-3 py-3 text-xl font-bold text-white outline-none ${focusColors[color]}`}
          placeholder="Enter price"
          required
        />
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Saved price:{" "}
        <span className="font-medium text-gray-300">
          {savedPrice === null
            ? "Not configured"
            : `₹${savedPrice.toLocaleString("en-IN")}`}
        </span>
      </p>
    </div>
  );
}

// --------------------------------------------------
// Reusable pricing summary item
// --------------------------------------------------

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs text-gray-400">{label}</p>

      <p className="mt-2 text-lg font-bold text-emerald-400">
        {value}
      </p>

      <p className="mt-1 text-xs text-gray-500">per hour</p>
    </div>
  );
}