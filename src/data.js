import { supabase } from "./supabaseClient";

export function sanitizeSiteCode(raw) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s]+/g, "-")
    .replace(/["'\\/]/g, "");
}

// Access is controlled by real login + site_members/RLS, not a PIN.
// Opening a site is just "try to read it" — RLS returns nothing if the
// logged-in user isn't a member.

export async function fetchWorkers(siteCode) {
  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("site_code", siteCode)
    .order("created_at", { ascending: true });
  return { ok: !error, data: data || [], error };
}

export async function addWorker(siteCode, worker) {
  const { data, error } = await supabase
    .from("workers")
    .insert({
      site_code: siteCode,
      name: worker.name,
      pay_type: worker.payType,
      daily_rate: worker.payType === "daily" ? worker.dailyRate : null,
      monthly_salary: worker.payType === "monthly" ? worker.monthlySalary : null,
    })
    .select()
    .single();
  return { ok: !error, data, error };
}

export async function updateWorker(id, worker) {
  const { data, error } = await supabase
    .from("workers")
    .update({
      name: worker.name,
      daily_rate: worker.payType === "daily" ? worker.dailyRate : null,
      monthly_salary: worker.payType === "monthly" ? worker.monthlySalary : null,
    })
    .eq("id", id)
    .select()
    .single();
  return { ok: !error, data, error };
}

export async function removeWorker(id) {
  const { error } = await supabase.from("workers").delete().eq("id", id);
  return { ok: !error, error };
}

export async function addWorkersBulk(siteCode, workers) {
  const rows = workers.map((w) => ({
    site_code: siteCode,
    name: w.name,
    pay_type: w.payType,
    daily_rate: w.payType === "daily" ? w.dailyRate : null,
    monthly_salary: w.payType === "monthly" ? w.monthlySalary : null,
  }));
  const { data, error } = await supabase.from("workers").insert(rows).select();
  return { ok: !error, data: data || [], error };
}

export async function fetchAttendance(siteCode) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("site_code", siteCode)
    .order("date", { ascending: false });
  return { ok: !error, data: data || [], error };
}

// Upserts one attendance row per worker for the given date, keyed on the
// (site_code, date, worker_id) unique constraint. Deliberately NOT a
// delete-then-reinsert — that would wipe a previously-attached photo every
// time the day's attendance is re-saved for any reason. Each entry may
// optionally carry photoUrl / locationLat / locationLng / capturedAt; if a
// worker's entry omits these, the existing stored values are left as-is by
// simply not including those keys in the upsert payload for that row.
export async function saveAttendanceForDate(siteCode, date, entries) {
  if (entries.length === 0) return { ok: true };
  const rows = entries.map((e) => {
    const row = {
      site_code: siteCode,
      date,
      worker_id: e.workerId,
      status: e.status,
      wage: e.wage,
    };
    if (e.photoUrl !== undefined) row.photo_url = e.photoUrl;
    if (e.locationLat !== undefined) row.location_lat = e.locationLat;
    if (e.locationLng !== undefined) row.location_lng = e.locationLng;
    if (e.capturedAt !== undefined) row.captured_at = e.capturedAt;
    return row;
  });
  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "site_code,date,worker_id" });
  return { ok: !error, error };
}

// Uploads one attendance verification photo to Supabase Storage and
// returns its public URL. Path is prefixed with the site code so it's easy
// to identify which site a photo belongs to when browsing the bucket
// directly; the storage policies in migration_004 keep the bucket public
// for simplicity (see README for the honest caveat on what that means).
export async function uploadAttendancePhoto(siteCode, workerId, date, file) {
  const path = `${siteCode}/${date}_${workerId}_${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("attendance-photos")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (uploadError) return { ok: false, error: uploadError };
  const { data } = supabase.storage.from("attendance-photos").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

export async function fetchPayments(siteCode) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("site_code", siteCode)
    .order("date", { ascending: false });
  return { ok: !error, data: data || [], error };
}

// Advances may optionally carry a recovery schedule: deductPerDay (flat
// amount recovered from each day worked) and/or interestPercentPerMonth
// (simple, non-compounding interest on the outstanding balance). Neither
// is required — omitting both keeps an advance behaving exactly like a
// plain one-time payment, manually settled later.
export async function addPayment(siteCode, payment) {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      site_code: siteCode,
      date: payment.date,
      worker_id: payment.workerId || null,
      amount: payment.amount,
      type: payment.type,
      notes: payment.notes || null,
      deduct_per_day: payment.type === "advance" && payment.deductPerDay ? payment.deductPerDay : null,
      interest_percent_per_month: payment.type === "advance" ? payment.interestPercentPerMonth || 0 : 0,
    })
    .select()
    .single();
  return { ok: !error, data, error };
}

export async function deletePayment(id) {
  const { error } = await supabase.from("payments").delete().eq("id", id);
  return { ok: !error, error };
}

// Per-site settings — currently just the chronic-absence threshold, but
// this is the natural place to add more per-site preferences later
// without needing another hardcoded constant in the app code.
export async function fetchSiteSettings(siteCode) {
  const { data, error } = await supabase
    .from("labor_sites")
    .select("absence_threshold")
    .eq("site_code", siteCode)
    .maybeSingle();
  return { ok: !error, absenceThreshold: data?.absence_threshold ?? 20, error };
}

export async function updateSiteSettings(siteCode, settings) {
  const { error } = await supabase
    .from("labor_sites")
    .update({ absence_threshold: settings.absenceThreshold })
    .eq("site_code", siteCode);
  return { ok: !error, error };
}
