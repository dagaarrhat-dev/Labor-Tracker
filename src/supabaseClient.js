import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly at build/run time rather than silently talking to nothing —
  // saves a confusing debugging session if the .env file is missing.
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project's values."
  );
}

// Session persistence settings are made explicit here rather than left to
// library defaults — this is what makes "stay logged in between visits"
// actually work: the session is saved to the browser's own localStorage
// (not Supabase's servers), and automatically refreshed before it expires.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});
