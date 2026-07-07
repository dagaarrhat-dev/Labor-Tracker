import { supabase } from "./supabaseClient";

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { ok: !error, data, error };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) {
    // Turn any pending invites for this email into real memberships now
    // that they're logged in — harmless no-op if there are none.
    await supabase.rpc("accept_pending_invites");
  }
  return { ok: !error, data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { ok: !error, error };
}

// Uses getSession(), not getUser(), on purpose: getSession() reads the
// session that was already saved to localStorage, which is exactly what
// "was this person already logged in before they reopened the site"
// needs. getUser() instead makes a live network round-trip to re-verify
// with Supabase's servers every time — using it here was the actual
// cause of a real bug where a valid saved session could be missed on
// load, bouncing someone back to the login screen who shouldn't have
// been.
export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
}

export function onAuthStateChange(callback) {
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return () => listener.subscription.unsubscribe();
}

export async function createSite(siteCode) {
  const { error } = await supabase.rpc("create_site", { new_site_code: siteCode });
  return { ok: !error, error };
}

export async function inviteToSite(siteCode, email, role = "member") {
  const { error } = await supabase.rpc("invite_to_site", {
    target_site_code: siteCode,
    target_email: email,
    target_role: role,
  });
  return { ok: !error, error };
}

// Returns the list of site codes the current user is a member of, along
// with their role at each — used to build the "Your Sites" list after login.
export async function fetchMySites() {
  const { data, error } = await supabase
    .from("site_members")
    .select("site_code, role, created_at")
    .order("created_at", { ascending: true });
  return { ok: !error, data: data || [], error };
}
