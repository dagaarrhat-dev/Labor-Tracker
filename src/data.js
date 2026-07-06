import { supabase } from "./supabaseClient";

export function sanitizeSiteCode(raw) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s]+/g, "-")
    .replace(/["'\\/]/g, "");
}

// Checks whether a site exists:
//  - If it doesn't exist yet, creates it with the given PIN (this call
//    becomes "set the PIN" for a brand-new site).
//  - If it exists and has no PIN set (old data from before PINs existed),
//    lets anyone in — matches the previous behavior, doesn't lock out
//    existing sites retroactively.
//  - If it exists and has a PIN, the entered PIN must match.
export async function checkOrCreateSite(siteCode, pin) {
  const { data: existing, error: fetchError } = await supabase
    .from("labor_sites")
    .select("site_code, pin")
    .eq("site_code", siteCode)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError };

  if (!existing) {
    const { error: insertError } = await supabase.from("labor_sites").insert({ site_code: siteCode, pin });
    if (insertError) return { ok: false, error: insertError };
    return { ok: true, created: true };
  }

  if (existing.pin && existing.pin !== pin) {
    return { ok: false, wrongPin: true };
  }

  return { ok: true, created: false };
}

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

export async function removeWorker(id) {
  const { error } = await supabase.from("workers").delete().eq("id", id);
  return { ok: !error, error };
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

export async function fetchAttendance(siteCode) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("site_code", siteCode)
    .order("date", { ascending: false });
  return { ok: !error, data: data || [], error };
}

// Replaces all attendance rows for one date in one call: delete then
// insert, wrapped so a failure partway through doesn't leave a half-updated
// day silently — the caller re-fetches to confirm what's actually saved.
export async function saveAttendanceForDate(siteCode, date, entries) {
  const del = await supabase.from("attendance").delete().eq("site_code", siteCode).eq("date", date);
  if (del.error) return { ok: false, error: del.error };
  if (entries.length === 0) return { ok: true };
  const rows = entries.map((e) => ({
    site_code: siteCode,
    date,
    worker_id: e.workerId,
    status: e.status,
    wage: e.wage,
  }));
  const { error } = await supabase.from("attendance").insert(rows);
  return { ok: !error, error };
}

export async function fetchPayments(siteCode) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("site_code", siteCode)
    .order("date", { ascending: false });
  return { ok: !error, data: data || [], error };
}

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
    })
    .select()
    .single();
  return { ok: !error, data, error };
}

export async function deletePayment(id) {
  const { error } = await supabase.from("payments").delete().eq("id", id);
  return { ok: !error, error };
}
