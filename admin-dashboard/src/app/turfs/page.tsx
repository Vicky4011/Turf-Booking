"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type TurfPhoto = {
  id: string;
  turf_id: string;
  image_url: string;
  storage_path: string;
  created_at: string;
};

type Turf = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  price_per_hour: number;
  is_active: boolean;
  image_url: string | null;
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

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES_PER_UPLOAD = 10;

export default function TurfManagementPage() {
  const router = useRouter();

  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [photos, setPhotos] = useState<TurfPhoto[]>([]);

  const [form, setForm] = useState<TurfForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoAction, setPhotoAction] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [galleryTurfId, setGalleryTurfId] = useState<string | null>(
    null
  );

  const loadTurfs = useCallback(async () => {
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
      .select(
        "id, name, description, location, price_per_hour, is_active, image_url"
      )
      .order("created_at", { ascending: false });

    if (turfError) {
      throw new Error(turfError.message);
    }

    setTurfs((data ?? []) as Turf[]);

    const { data: photoData, error: photoError } = await supabase
      .from("turf_photos")
      .select("id, turf_id, image_url, storage_path, created_at")
      .order("created_at", { ascending: true });

    if (photoError) {
      throw new Error(
        `Unable to load turf photos: ${photoError.message}`
      );
    }

    setPhotos((photoData ?? []) as TurfPhoto[]);
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        await loadTurfs();
      } catch (caught) {
        if (mounted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load turfs."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      mounted = false;
    };
  }, [loadTurfs]);

  // Create and clean up local previews for newly selected images.
  useEffect(() => {
    const urls = selectedFiles.map((file) =>
      URL.createObjectURL(file)
    );

    setPreviews(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedFiles]);

  function updateField(field: keyof TurfForm, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function handlePhotoSelection(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files ?? []);

    setError("");
    setSuccess("");

    if (files.length > MAX_IMAGES_PER_UPLOAD) {
      setError(
        `Choose up to ${MAX_IMAGES_PER_UPLOAD} photos at a time.`
      );
      event.target.value = "";
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} is not a valid image.`);
        event.target.value = "";
        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        setError(`${file.name} exceeds the 5 MB limit.`);
        event.target.value = "";
        return;
      }
    }

    setSelectedFiles(files);
  }

  function clearSelectedFiles() {
    setSelectedFiles([]);

    const input = document.getElementById(
      "turf-photo-upload"
    ) as HTMLInputElement | null;

    if (input) {
      input.value = "";
    }
  }

  function startEditing(turf: Turf) {
    setEditingId(turf.id);

    setForm({
      name: turf.name,
      description: turf.description ?? "",
      location: turf.location ?? "",
      price_per_hour: String(turf.price_per_hour),
    });

    setSelectedFiles([]);
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
    setSelectedFiles([]);
    setError("");
    setSuccess("");
  }

  function safeFileName(name: string) {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "turf-photo"
    );
  }

  async function uploadPhotos(
    turfId: string,
    files: File[]
  ): Promise<TurfPhoto[]> {
    if (files.length === 0) {
      return [];
    }

    const uploadedPhotos: TurfPhoto[] = [];

    for (const file of files) {
      const storagePath = `${turfId}/${crypto.randomUUID()}-${safeFileName(
        file.name
      )}`;

      const { error: uploadError } = await supabase.storage
        .from("turf-photos")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(
          `Could not upload ${file.name}: ${uploadError.message}`
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from("turf-photos")
        .getPublicUrl(storagePath);

      const photoRecord = {
        turf_id: turfId,
        image_url: publicUrlData.publicUrl,
        storage_path: storagePath,
      };

      const { data: insertedPhoto, error: insertPhotoError } =
        await supabase
          .from("turf_photos")
          .insert(photoRecord)
          .select(
            "id, turf_id, image_url, storage_path, created_at"
          )
          .single();

      if (insertPhotoError) {
        // Remove the uploaded file if saving its database record fails.
        await supabase.storage
          .from("turf-photos")
          .remove([storagePath]);

        throw new Error(
          `Could not save photo details: ${insertPhotoError.message}`
        );
      }

      uploadedPhotos.push(insertedPhoto as TurfPhoto);
    }

    return uploadedPhotos;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
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

      const turfData = {
        name: form.name.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        price_per_hour: price,
      };

      let turfId = editingId;
      let newTurf = false;

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
      } else {
        const { data: createdTurf, error: insertError } =
          await supabase
            .from("turfs")
            .insert(turfData)
            .select("id")
            .single();

        if (insertError) {
          throw new Error(insertError.message);
        }

        turfId = createdTurf.id;
        newTurf = true;
      }

      if (!turfId) {
        throw new Error("Could not identify the turf.");
      }

      const uploadedPhotos = await uploadPhotos(
        turfId,
        selectedFiles
      );

      // When the turf has no cover image, use its first uploaded photo.
      const currentTurf = turfs.find(
        (turf) => turf.id === turfId
      );

      const currentCover = currentTurf?.image_url ?? null;

      if (uploadedPhotos.length > 0 && !currentCover) {
        const firstPhoto = uploadedPhotos[0];

        const { error: coverError } = await supabase
          .from("turfs")
          .update({
            image_url: firstPhoto.image_url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", turfId);

        if (coverError) {
          throw new Error(
            `Photos uploaded, but cover image could not be saved: ${coverError.message}`
          );
        }
      }

      setForm(emptyForm);
      setEditingId(null);
      setSelectedFiles([]);

      await loadTurfs();

      setSuccess(
        newTurf
          ? "Turf created successfully."
          : uploadedPhotos.length > 0
            ? `Turf updated and ${uploadedPhotos.length} photo(s) uploaded.`
            : "Turf details updated successfully."
      );
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

  async function setCoverPhoto(photo: TurfPhoto) {
    setError("");
    setSuccess("");
    setPhotoAction(photo.id);

    try {
      const { error: updateError } = await supabase
        .from("turfs")
        .update({
          image_url: photo.image_url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", photo.turf_id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await loadTurfs();

      setSuccess(
        "Cover image updated. This photo will be used as the main turf image."
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to set cover image."
      );
    } finally {
      setPhotoAction("");
    }
  }

  async function deletePhoto(photo: TurfPhoto) {
    const confirmed = window.confirm(
      "Delete this photo permanently? This cannot be undone."
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");
    setPhotoAction(photo.id);

    try {
      const turf = turfs.find(
        (item) => item.id === photo.turf_id
      );

      const isCover = turf?.image_url === photo.image_url;

      // Delete the file first. If this fails, keep its database record.
      const { error: storageError } = await supabase.storage
        .from("turf-photos")
        .remove([photo.storage_path]);

      if (storageError) {
        throw new Error(
          `Could not delete the storage file: ${storageError.message}`
        );
      }

      const { error: deleteError } = await supabase
        .from("turf_photos")
        .delete()
        .eq("id", photo.id);

      if (deleteError) {
        throw new Error(
          `File deleted, but its photo record could not be removed: ${deleteError.message}`
        );
      }

      // If the cover was deleted, choose another remaining gallery photo.
      if (isCover) {
        const remaining = photos.filter(
          (item) =>
            item.turf_id === photo.turf_id &&
            item.id !== photo.id
        );

        const nextCover = remaining[0]?.image_url ?? null;

        const { error: coverError } = await supabase
          .from("turfs")
          .update({
            image_url: nextCover,
            updated_at: new Date().toISOString(),
          })
          .eq("id", photo.turf_id);

        if (coverError) {
          throw new Error(
            `Photo deleted, but the replacement cover could not be saved: ${coverError.message}`
          );
        }
      }

      await loadTurfs();
      setSuccess("Photo deleted successfully.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to delete photo."
      );
    } finally {
      setPhotoAction("");
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

  function photosForTurf(turfId: string) {
    return photos.filter((photo) => photo.turf_id === turfId);
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

        <header className="mb-8 mt-6">
          <h1 className="text-3xl font-bold">Turf Management</h1>
          <p className="mt-2 text-slate-400">
            Manage your turfs, photos, cover images, pricing, and availability.
          </p>
        </header>

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

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <SummaryCard title="Total Turfs" value={turfs.length} />
          <SummaryCard
            title="Active Turfs"
            value={turfs.filter((turf) => turf.is_active).length}
          />
          <SummaryCard
            title="Inactive Turfs"
            value={turfs.filter((turf) => !turf.is_active).length}
          />
        </section>

        {/* Add / edit turf */}
        <section className="mb-8 rounded-2xl border border-white/10 bg-[#101622] p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">
              {editingId ? "Edit Turf" : "Add New Turf"}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Add the turf details and select multiple photos.
              You can choose the cover image from the gallery below.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Turf Name">
                <input
                  value={form.name}
                  onChange={(event) =>
                    updateField("name", event.target.value)
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
                  onChange={(event) =>
                    updateField("location", event.target.value)
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
                  onChange={(event) =>
                    updateField(
                      "price_per_hour",
                      event.target.value
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
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
                  placeholder="Describe your turf and facilities"
                  maxLength={2000}
                  rows={3}
                  className={inputClass}
                />
              </FormField>
            </div>

            <div className="rounded-xl border border-dashed border-white/15 bg-[#080d16] p-5">
              <label
                htmlFor="turf-photo-upload"
                className="block text-sm font-medium text-slate-200"
              >
                Turf Photos
              </label>

              <p className="mt-2 text-sm text-slate-400">
                Select multiple images. Maximum 10 per upload and
                5 MB per image.
              </p>

              <input
                id="turf-photo-upload"
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelection}
                className="mt-4 block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-400 file:px-4 file:py-2 file:font-semibold file:text-slate-950 hover:file:bg-emerald-300"
              />

              {previews.length > 0 && (
                <>
                  <p className="mt-5 text-sm font-medium text-slate-300">
                    Selected photos ({previews.length})
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                    {previews.map((preview, index) => (
                      <div
                        key={`${preview}-${index}`}
                        className="overflow-hidden rounded-xl border border-white/10"
                      >
                        <img
                          src={preview}
                          alt={`Selected turf photo ${index + 1}`}
                          className="h-28 w-full object-cover"
                        />
                        <p className="truncate px-2 py-2 text-xs text-slate-400">
                          {selectedFiles[index]?.name}
                        </p>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={clearSelectedFiles}
                    className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                  >
                    Clear selected photos
                  </button>
                </>
              )}

              {editingId && (
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Uploading new photos adds them to this turf's gallery.
                  Existing photos are not removed when you edit turf details.
                </p>
              )}
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
                    ? "Save Changes & Upload Photos"
                    : "Add Turf & Upload Photos"}
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

        {/* Registered turfs and their galleries */}
        <section className="rounded-2xl border border-white/10 bg-[#101622] p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Registered Turfs</h2>
            <p className="mt-2 text-sm text-slate-400">
              Manage each turf and select the exact photo you want
              customers to see as its cover image.
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
            <div className="space-y-5">
              {turfs.map((turf) => {
                const turfPhotos = photosForTurf(turf.id);
                const galleryOpen = galleryTurfId === turf.id;

                return (
                  <article
                    key={turf.id}
                    className="overflow-hidden rounded-xl border border-white/10 bg-[#080d16]"
                  >
                    <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
                      <div className="w-full shrink-0 sm:w-48">
                        {turf.image_url ? (
                          <img
                            src={turf.image_url}
                            alt={`${turf.name} cover`}
                            className="h-36 w-full rounded-xl border border-white/10 object-cover"
                          />
                        ) : (
                          <div className="flex h-36 w-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#101622] text-4xl">
                            🏟️
                          </div>
                        )}

                        <p className="mt-2 text-center text-xs text-emerald-300">
                          {turf.image_url
                            ? "Current cover image"
                            : "No cover image selected"}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1">
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
                          {Number(turf.price_per_hour).toLocaleString(
                            "en-IN"
                          )}
                          <span className="text-sm font-normal text-slate-400">
                            {" "}/ hour
                          </span>
                        </p>

                        <p className="mt-2 text-sm text-slate-500">
                          {turfPhotos.length} gallery photo
                          {turfPhotos.length === 1 ? "" : "s"}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(turf)}
                            className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                          >
                            Edit Details / Add Photos
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setGalleryTurfId(
                                galleryOpen ? null : turf.id
                              )
                            }
                            className="rounded-lg border border-emerald-400/30 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-400/10"
                          >
                            {galleryOpen
                              ? "Hide Gallery"
                              : "Manage Photos"}
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
                    </div>

                    {galleryOpen && (
                      <div className="border-t border-white/10 p-5">
                        <div className="mb-4">
                          <h4 className="font-semibold">
                            {turf.name} — Photo Gallery
                          </h4>

                          <p className="mt-1 text-sm text-slate-400">
                            Select “Set as Cover” on the photo you want
                            displayed as the main turf image.
                          </p>
                        </div>

                        {turfPhotos.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                            <p className="text-sm text-slate-400">
                              No gallery photos yet.
                            </p>

                            <button
                              type="button"
                              onClick={() => startEditing(turf)}
                              className="mt-3 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
                            >
                              Upload Photos
                            </button>

                            {turf.image_url && (
                              <p className="mt-3 text-xs text-slate-500">
                                This turf has a cover image, but it is not
                                registered in the gallery. Upload it again
                                if you want it managed here.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                            {turfPhotos.map((photo) => {
                              const isCover =
                                turf.image_url === photo.image_url;
                              const busy = photoAction === photo.id;

                              return (
                                <div
                                  key={photo.id}
                                  className={`overflow-hidden rounded-xl border ${
                                    isCover
                                      ? "border-emerald-400"
                                      : "border-white/10"
                                  } bg-[#101622]`}
                                >
                                  <img
                                    src={photo.image_url}
                                    alt={`${turf.name} gallery photo`}
                                    className="h-36 w-full object-cover"
                                  />

                                  <div className="space-y-2 p-3">
                                    {isCover ? (
                                      <span className="inline-flex rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-300">
                                        ★ Cover Image
                                      </span>
                                    ) : (
                                      <span className="inline-block text-xs text-slate-500">
                                        Gallery Photo
                                      </span>
                                    )}

                                    {!isCover && (
                                      <button
                                        type="button"
                                        disabled={Boolean(photoAction)}
                                        onClick={() =>
                                          setCoverPhoto(photo)
                                        }
                                        className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                                      >
                                        {busy
                                          ? "Updating..."
                                          : "Set as Cover"}
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      disabled={Boolean(photoAction)}
                                      onClick={() =>
                                        deletePhoto(photo)
                                      }
                                      className="w-full rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                                    >
                                      {busy
                                        ? "Processing..."
                                        : "Delete Photo"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => startEditing(turf)}
                          className="mt-5 rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                        >
                          + Upload More Photos
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
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
  children: ReactNode;
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