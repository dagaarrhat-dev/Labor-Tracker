import { supabase } from "./supabaseClient";

export function sanitizeSiteCode(raw) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s]+/g, "-")
    .replace(/["'\\/]/g, "");
}

// Creates the site row if it doesn't exist yet (idempotent). Returns
// { ok, error }. This also doubles as our "does this site exist" check —
// if it already exists, the insert is a harmless no-op via upsert.
export async function ensureSite(siteCode) {
  const { error } = await supabase
    .from("labor_sites")
    .upsert({ site_code: siteCode }, { onConflict: "site_code", ignoreDuplicates: true });
  return { ok: !error, error };
}

export async function fetchWorkers(siteCode) {
  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("site_code", siteCode)
    .order("created_at", { ascending: true });
  return { ok: !error, data: data || [], error };
}

export async function addWorker(siteCode, name, dailyRate) {
  const { data, error } = await supabase
    .from("workers")
    .insert({ site_code: siteCode, name, daily_rate: dailyRate })
    .select()
    .single();
  return { ok: !error, data, error };
}

export async function removeWorker(id) {
  const { error } = await supabase.from("workers").delete().eq("id", id);
  return { ok: !error, error };
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
