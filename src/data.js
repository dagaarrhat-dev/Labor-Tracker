\import { supabase } from "./supabaseClient";

export function sanitizeSiteCode(raw) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s]+/g, "-")
    .replace(/["'\\/]/g, "");
}

// Access is now controlled by real login + site_members/RLS, not a PIN.
// Opening a site is just "try to read it" — if the logged-in user isn't a
// member, RLS makes the read return nothing rather than erroring, so the
// app treats an empty result as "either brand new or no access" (see
// openOrJoinSite in App.jsx, which calls createSite() from auth.js first).

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
