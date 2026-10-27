"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Turf = {
  id: string;
  name: string;
};

type TurfPricing = {
  turf_id: string;
  day_type: "weekday" | "weekend";
  period_type: "daytime" | "nighttime";
  price_per_hour: number | string;
};

type TurfPriceSummary = {
  weekdayDay: number | null;
  weekdayNight: number | null;
  weekendDay: number | null;
  weekendNight: number | null;
};

const EMPTY_PRICES: TurfPriceSummary = {
  weekdayDay: null,
  weekdayNight: null,
  weekendDay: null,
  weekendNight: null,
};

function formatPrice(price: number | null): string {
  if (price === null) return "Not set";

  return `₹${price.toLocaleString("en-IN")}`;
}

export default function PricingSummary() {
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [prices, setPrices] = useState<Record<string, TurfPriceSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPricing = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // Load turfs individually.
      const { data: turfData, error: turfError } = await supabase
        .from("turfs")
        .select("id, name")
        .order("name");

      if (turfError) throw turfError;

      const turfList = (turfData ?? []) as Turf[];

      setTurfs(turfList);

      if (turfList.length === 0) {
        setPrices({});
        return;
      }

      // Load prices for all turfs.
      const { data: pricingData, error: pricingError } = await supabase
        .from("turf_pricing")
        .select("turf_id, day_type, period_type, price_per_hour")
        .in(
          "turf_id",
          turfList.map((turf) => turf.id)
        );

      if (pricingError) throw pricingError;

      const summary: Record<string, TurfPriceSummary> = {};

      // Start each turf with four empty prices.
      for (const turf of turfList) {
        summary[turf.id] = { ...EMPTY_PRICES };
      }

      // Assign each price to the correct turf and period.
      for (const row of (pricingData ?? []) as TurfPricing[]) {
        const turfPrice = summary[row.turf_id];

        if (!turfPrice) continue;

        const amount = Number(row.price_per_hour);

        if (!Number.isFinite(amount)) continue;

        if (
          row.day_type === "weekday" &&
          row.period_type === "daytime"
        ) {
          turfPrice.weekdayDay = amount;
        }

        if (
          row.day_type === "weekday" &&
          row.period_type === "nighttime"
        ) {
          turfPrice.weekdayNight = amount;
        }

        if (
          row.day_type === "weekend" &&
          row.period_type === "daytime"
        ) {
          turfPrice.weekendDay = amount;
        }

        if (
          row.day_type === "weekend" &&
          row.period_type === "nighttime"
        ) {
          turfPrice.weekendNight = amount;
        }
      }

      setPrices(summary);
    } catch (err) {
      console.error("Unable to load turf pricing:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load turf prices."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPricing();
  }, [loadPricing]);

  return (
    <section className="mt-8 rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">
            Turf Pricing Overview
          </h2>

          <p className="mt-1 text-sm text-gray-400">
            View and manage the hourly prices for each turf.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void loadPricing()}
            disabled={loading}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

          <Link
            href="/pricing"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-gray-950 transition hover:bg-emerald-400"
          >
            Manage Pricing
          </Link>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300"
        >
          Failed to load prices: {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">
          Loading turf prices...
        </div>
      ) : turfs.length === 0 ? (
        /* Empty state */
        <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center">
          <h3 className="font-semibold text-white">No turfs available</h3>

          <p className="mt-2 text-sm text-gray-400">
            Add a turf before configuring its pricing.
          </p>

          <Link
            href="/turfs"
            className="mt-4 inline-block font-medium text-emerald-400 hover:text-emerald-300"
          >
            Add a Turf →
          </Link>
        </div>
      ) : (
        /* Pricing table */
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-gray-950 text-gray-400">
              <tr>
                <th className="px-4 py-4 font-semibold">Turf</th>

                <th className="px-4 py-4 font-semibold">
                  Weekday Day
                </th>

                <th className="px-4 py-4 font-semibold">
                  Weekday Night
                </th>

                <th className="px-4 py-4 font-semibold">
                  Weekend Day
                </th>

                <th className="px-4 py-4 font-semibold">
                  Weekend Night
                </th>

                <th className="px-4 py-4 font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-800">
              {turfs.map((turf) => {
                const turfPrice = prices[turf.id] ?? EMPTY_PRICES;

                const allPricesSet =
                  turfPrice.weekdayDay !== null &&
                  turfPrice.weekdayNight !== null &&
                  turfPrice.weekendDay !== null &&
                  turfPrice.weekendNight !== null;

                return (
                  <tr
                    key={turf.id}
                    className="transition hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">
                        {turf.name}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {allPricesSet
                          ? "All prices configured"
                          : "Pricing incomplete"}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <span className="font-semibold text-emerald-400">
                        {formatPrice(turfPrice.weekdayDay)}
                      </span>

                      <span className="mt-1 block text-xs text-gray-500">
                        per hour
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <span className="font-semibold text-emerald-400">
                        {formatPrice(turfPrice.weekdayNight)}
                      </span>

                      <span className="mt-1 block text-xs text-gray-500">
                        per hour
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <span className="font-semibold text-sky-400">
                        {formatPrice(turfPrice.weekendDay)}
                      </span>

                      <span className="mt-1 block text-xs text-gray-500">
                        per hour
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <span className="font-semibold text-sky-400">
                        {formatPrice(turfPrice.weekendNight)}
                      </span>

                      <span className="mt-1 block text-xs text-gray-500">
                        per hour
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <Link
                        href={`/pricing?turf=${encodeURIComponent(turf.id)}`}
                        className="inline-block rounded-lg border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500 hover:text-gray-950"
                      >
                        Edit Prices
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500">
        Prices are independent for each turf and are displayed per hour.
      </p>
    </section>
  );
}