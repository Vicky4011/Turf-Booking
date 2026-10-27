"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Turf = {
  id: string;
  name: string;
};

type OperatingHour = {
  id?: string;
  turf_id: string;
  day_of_week: number;
  opening_time: string;
  closing_time: string;
  is_open: boolean;
};

type BlockedSlot = {
  id: string;
  turf_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
};

const DAYS = [
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
  { label: "Sunday", value: 0 },
];

const DEFAULT_OPEN = "06:00";
const DEFAULT_CLOSE = "23:00";

function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function defaultSchedule(turfId: string): OperatingHour[] {
  return DAYS.map((day) => ({
    turf_id: turfId,
    day_of_week: day.value,
    opening_time: DEFAULT_OPEN,
    closing_time: DEFAULT_CLOSE,
    is_open: true,
  }));
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(time: string): string {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function generateHourlySlots(
openingTime: string,
closingTime: string
): { start: string; end: string }[] {
const slots: { start: string; end: string }[] = [];

const opening = timeToMinutes(openingTime);
let closing = timeToMinutes(closingTime);

// Equal opening and closing times mean 24-hour operation.
if (closing <= opening) {
closing += 24 * 60;
}

for (
let current = opening;
current + 60 <= closing;
current += 60
) {
const startMinutes = current;
const endMinutes = current + 60;

const startHours = Math.floor(startMinutes / 60) % 24;
const endHours = Math.floor(endMinutes / 60) % 24;

const start = `${String(startHours).padStart(2, "0")}:00:00`;
const end = `${String(endHours).padStart(2, "0")}:00:00`;

slots.push({ start, end });

}

return slots;
}



export default function SlotManagementPage() {
  const router = useRouter();

  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [selectedTurf, setSelectedTurf] = useState("");
  const [schedule, setSchedule] = useState<OperatingHour[]>([]);
  const [selectedDate, setSelectedDate] = useState("");

  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [blockReason, setBlockReason] = useState("");

  const [initialLoading, setInitialLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [changingBlock, setChangingBlock] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadTurfs = useCallback(async () => {
    setInitialLoading(true);
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
        .single();

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
        if (current && turfList.some((turf) => turf.id === current)) {
          return current;
        }

        return turfList[0]?.id ?? "";
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load turfs."
      );
    } finally {
      setInitialLoading(false);
    }
  }, [router]);

  useEffect(() => {
    setSelectedDate(todayLocal());
    void loadTurfs();
  }, [loadTurfs]);

  const loadSchedule = useCallback(async () => {
    if (!selectedTurf) {
      setSchedule([]);
      return;
    }

    setScheduleLoading(true);

    try {
      const { data, error: queryError } = await supabase
        .from("operating_hours")
        .select("*")
        .eq("turf_id", selectedTurf);

      if (queryError) throw queryError;

      const savedHours = (data ?? []) as OperatingHour[];
      const defaults = defaultSchedule(selectedTurf);

      setSchedule(
        defaults.map((day) => {
          const saved = savedHours.find(
            (item) => item.day_of_week === day.day_of_week
          );

          return saved
            ? {
                ...day,
                ...saved,
                opening_time: saved.opening_time.slice(0, 5),
                closing_time: saved.closing_time.slice(0, 5),
              }
            : day;
        })
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not load operating hours: ${err.message}`
          : "Unable to load operating hours."
      );
    } finally {
      setScheduleLoading(false);
    }
  }, [selectedTurf]);

  const loadBlockedSlots = useCallback(async () => {
    if (!selectedTurf || !selectedDate) {
      setBlockedSlots([]);
      return;
    }

    setBlocksLoading(true);

    try {
      const { data, error: queryError } = await supabase
        .from("blocked_slots")
        .select("*")
        .eq("turf_id", selectedTurf)
        .eq("slot_date", selectedDate)
        .order("start_time");

      if (queryError) throw queryError;

      setBlockedSlots((data ?? []) as BlockedSlot[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not load blocked slots: ${err.message}`
          : "Unable to load blocked slots."
      );
    } finally {
      setBlocksLoading(false);
    }
  }, [selectedTurf, selectedDate]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  useEffect(() => {
    void loadBlockedSlots();
  }, [loadBlockedSlots]);

  function updateSchedule(
    dayValue: number,
    field: "opening_time" | "closing_time" | "is_open",
    value: string | boolean
  ) {
    setSchedule((current) =>
      current.map((day) =>
        day.day_of_week === dayValue
          ? { ...day, [field]: value }
          : day
      )
    );

    setMessage("");
    setError("");
  }

  async function saveSchedule() {
    if (!selectedTurf) {
      setError("Please add a turf first.");
      return;
    }

    for (const day of schedule) {
      if (!day.is_open) continue;

      if (
        !day.opening_time ||
        !day.closing_time ||
        timeToMinutes(day.opening_time) >
         timeToMinutes(day.closing_time)
      ) {
        setError(
          `Check the opening and closing times for ${
            DAYS.find((item) => item.value === day.day_of_week)?.label
          }. Closing time must be later than opening time.`
        );
        return;
      }
    }

    setSavingSchedule(true);
    setMessage("");
    setError("");

    try {
      const rows = schedule.map((day) => ({
        turf_id: selectedTurf,
        day_of_week: day.day_of_week,
        opening_time: day.opening_time,
        closing_time: day.closing_time,
        is_open: day.is_open,
      }));

      const { error: saveError } = await supabase
        .from("operating_hours")
        .upsert(rows, {
          onConflict: "turf_id,day_of_week",
        });

      if (saveError) throw saveError;

      setMessage("Weekly operating hours saved successfully.");
      await loadSchedule();
    } catch (err: unknown) {
  const message =
    typeof err === "object" &&
    err !== null &&
    "message" in err
      ? String(err.message)
      : "An unknown error occurred.";

  console.error("Save schedule error:", err);
  setError(`Unable to save schedule: ${message}`);
    } finally {
      setSavingSchedule(false);
    }
  }

  async function blockSlot(startTime: string, endTime: string) {
    if (!selectedTurf || !selectedDate) {
      setError("Select a turf and date first.");
      return;
    }

    const existingBlock = blockedSlots.find(
      (slot) =>
        slot.start_time.slice(0, 5) === startTime.slice(0, 5) &&
        slot.end_time.slice(0, 5) === endTime.slice(0, 5)
    );

    if (existingBlock) {
      setError("This slot is already blocked.");
      return;
    }

    setChangingBlock(startTime);
    setMessage("");
    setError("");

    try {
      const { error: insertError } = await supabase
        .from("blocked_slots")
        .insert({
          turf_id: selectedTurf,
          slot_date: selectedDate,
          start_time: startTime,
          end_time: endTime,
          reason: blockReason.trim() || null,
        });

      if (insertError) throw insertError;

      setBlockReason("");
      setMessage(
        `${formatTime(startTime)}–${formatTime(endTime)} blocked successfully.`
      );

      await loadBlockedSlots();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Unable to block this slot: ${err.message}`
          : "Unable to block this slot."
      );
    } finally {
      setChangingBlock("");
    }
  }

  async function unblockSlot(slot: BlockedSlot) {
    setChangingBlock(slot.id);
    setMessage("");
    setError("");

    try {
      const { error: deleteError } = await supabase
        .from("blocked_slots")
        .delete()
        .eq("id", slot.id);

      if (deleteError) throw deleteError;

      setMessage(
        `${formatTime(slot.start_time)}–${formatTime(slot.end_time)} unblocked successfully.`
      );

      await loadBlockedSlots();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Unable to unblock this slot: ${err.message}`
          : "Unable to unblock this slot."
      );
    } finally {
      setChangingBlock("");
    }
  }

  const selectedWeekday = selectedDate
    ? new Date(`${selectedDate}T12:00:00`).getDay()
    : -1;

  const selectedDaySchedule = schedule.find(
    (day) => day.day_of_week === selectedWeekday
  );

  const availableSlots =
    selectedDaySchedule?.is_open
      ? generateHourlySlots(
          selectedDaySchedule.opening_time,
          selectedDaySchedule.closing_time
        )
      : [];

  const selectedTurfName =
    turfs.find((turf) => turf.id === selectedTurf)?.name ?? "";

  if (initialLoading) {
    return (
      <main className="min-h-screen bg-[#080b12] p-8 text-white">
        Loading Slot Management...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080b12] px-5 py-8 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/dashboard"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← Back to Dashboard
        </Link>

        <div className="mt-6">
          <h1 className="text-3xl font-bold">Slot Management</h1>
          <p className="mt-2 text-slate-400">
            Manage weekly opening hours and block individual one-hour slots.
          </p>
        </div>

        {(error || message) && (
          <div
            className={`mt-6 rounded-xl border p-4 text-sm ${
              error
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            {error || message}
          </div>
        )}

        {turfs.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-[#101622] p-8">
            <h2 className="text-xl font-semibold">No turfs found</h2>
            <p className="mt-2 text-slate-400">
              Add a turf before configuring operating hours.
            </p>
            <Link
              href="/turfs"
              className="mt-5 inline-block rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black"
            >
              Add a Turf
            </Link>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-2xl border border-white/10 bg-[#101622] p-5 md:p-7">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="turf-select"
                    className="mb-2 block text-sm text-slate-300"
                  >
                    Select Turf
                  </label>

                  <select
                    id="turf-select"
                    value={selectedTurf}
                    onChange={(event) =>
                      setSelectedTurf(event.target.value)
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#080b12] px-4 py-3 outline-none focus:border-emerald-400"
                  >
                    {turfs.map((turf) => (
                      <option key={turf.id} value={turf.id}>
                        {turf.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="slot-date"
                    className="mb-2 block text-sm text-slate-300"
                  >
                    Choose Date
                  </label>

                  <input
                    id="slot-date"
                    type="date"
                    value={selectedDate}
                    min={todayLocal()}
                    onChange={(event) => {
                      setSelectedDate(event.target.value);
                      setMessage("");
                      setError("");
                    }}
                    className="w-full rounded-xl border border-white/10 bg-[#080b12] px-4 py-3 text-white outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border border-white/10 bg-[#101622] p-5 md:p-7">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-xl font-semibold">
                    Weekly Operating Hours
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Set opening and closing times for each weekday.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={saveSchedule}
                  disabled={savingSchedule || scheduleLoading}
                  className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black hover:bg-emerald-300 disabled:opacity-50"
                >
                  {savingSchedule ? "Saving..." : "Save Schedule"}
                </button>
              </div>

              {scheduleLoading ? (
                <p className="mt-6 text-slate-400">
                  Loading schedule...
                </p>
              ) : (
                <div className="mt-6 space-y-4">
                  {DAYS.map((day) => {
                    const item = schedule.find(
                      (entry) => entry.day_of_week === day.value
                    );

                    if (!item) return null;

                    return (
                      <div
                        key={day.value}
                        className="grid grid-cols-1 gap-4 rounded-xl border border-white/10 bg-[#0b101a] p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
                      >
                        <div>
                          <p className="font-medium">{day.label}</p>
                          <p
                            className={`mt-1 text-xs ${
                              item.is_open
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {item.is_open ? "Open" : "Closed"}
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor={`open-${day.value}`}
                            className="mb-2 block text-sm text-slate-400"
                          >
                            Opening Time
                          </label>

                          <input
                            id={`open-${day.value}`}
                            type="time"
                            value={item.opening_time}
                            disabled={!item.is_open}
                            onChange={(event) =>
                              updateSchedule(
                                day.value,
                                "opening_time",
                                event.target.value
                              )
                            }
                            className="w-full rounded-lg border border-white/10 bg-[#080b12] px-3 py-3 disabled:opacity-40"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`close-${day.value}`}
                            className="mb-2 block text-sm text-slate-400"
                          >
                            Closing Time
                          </label>

                          <input
                            id={`close-${day.value}`}
                            type="time"
                            value={item.closing_time}
                            disabled={!item.is_open}
                            onChange={(event) =>
                              updateSchedule(
                                day.value,
                                "closing_time",
                                event.target.value
                              )
                            }
                            className="w-full rounded-lg border border-white/10 bg-[#080b12] px-3 py-3 disabled:opacity-40"
                          />
                        </div>

                        <label className="flex cursor-pointer items-center gap-3 pb-3 text-sm">
                          <input
                            type="checkbox"
                            checked={!item.is_open}
                            onChange={(event) =>
                              updateSchedule(
                                day.value,
                                "is_open",
                                !event.target.checked
                              )
                            }
                            className="h-4 w-4 accent-emerald-400"
                          />
                          Closed all day
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-8 rounded-2xl border border-white/10 bg-[#101622] p-5 md:p-7">
              <div>
                <h2 className="text-xl font-semibold">
                  Individual Slot Blocking
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {selectedTurfName} ·{" "}
                  {selectedDate
                    ? new Date(
                        `${selectedDate}T12:00:00`
                      ).toLocaleDateString("en-IN", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "Select a date"}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Blocking a slot affects only this turf and date.
                </p>
              </div>

              <div className="mt-6">
                <label
                  htmlFor="block-reason"
                  className="mb-2 block text-sm text-slate-300"
                >
                  Reason for blocking (optional)
                </label>

                <input
                  id="block-reason"
                  type="text"
                  value={blockReason}
                  onChange={(event) =>
                    setBlockReason(event.target.value)
                  }
                  placeholder="e.g. Maintenance, private event"
                  maxLength={200}
                  className="w-full rounded-xl border border-white/10 bg-[#080b12] px-4 py-3 outline-none focus:border-emerald-400"
                />
              </div>

              {blocksLoading ? (
                <p className="mt-6 text-slate-400">
                  Loading blocked slots...
                </p>
              ) : !selectedDaySchedule ? (
                <p className="mt-6 text-slate-400">
                  Save the weekly schedule to configure slots.
                </p>
              ) : !selectedDaySchedule.is_open ? (
                <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-red-300">
                  This turf is closed all day on the selected weekday.
                </div>
              ) : availableSlots.length === 0 ? (
                <p className="mt-6 text-slate-400">
                  No complete one-hour slots fit within these operating
                  hours. Choose different opening and closing times.
                </p>
              ) : (
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {availableSlots.map((slot) => {
                    const existingBlock = blockedSlots.find(
                      (blocked) =>
                        blocked.start_time.slice(0, 5) ===
                          slot.start.slice(0, 5) &&
                        blocked.end_time.slice(0, 5) ===
                          slot.end.slice(0, 5)
                    );

                    const isChanging =
                      changingBlock === slot.start ||
                      changingBlock === existingBlock?.id;

                    return (
                      <div
                        key={slot.start}
                        className={`rounded-xl border p-4 ${
                          existingBlock
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-emerald-500/20 bg-emerald-500/5"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">
                              {formatTime(slot.start)} –{" "}
                              {formatTime(slot.end)}
                            </p>

                            <p
                              className={`mt-2 text-sm ${
                                existingBlock
                                  ? "text-red-400"
                                  : "text-emerald-400"
                              }`}
                            >
                              {existingBlock ? "Blocked" : "Available"}
                            </p>
                          </div>

                          <span>
                            {existingBlock ? "🔒" : "🟢"}
                          </span>
                        </div>

                        {existingBlock?.reason && (
                          <p className="mt-3 text-sm text-slate-400">
                            Reason: {existingBlock.reason}
                          </p>
                        )}

                        {existingBlock ? (
                          <button
                            type="button"
                            onClick={() =>
                              void unblockSlot(existingBlock)
                            }
                            disabled={Boolean(changingBlock)}
                            className="mt-4 w-full rounded-lg border border-emerald-400/30 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-50"
                          >
                            {isChanging ? "Please wait..." : "Unblock Slot"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void blockSlot(slot.start, slot.end)
                            }
                            disabled={Boolean(changingBlock)}
                            className="mt-4 w-full rounded-lg border border-red-400/30 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                          >
                            {isChanging ? "Please wait..." : "Block Slot"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 rounded-xl border border-white/10 bg-[#0b101a] p-4 text-sm leading-6 text-slate-400">
                <strong className="text-white">Remember:</strong> These
                controls save operating hours and blocked slots to Supabase.
                They do not yet update your public website's availability
                display or automatically prevent overlapping customer bookings.
                We will connect those protections before production use.
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}