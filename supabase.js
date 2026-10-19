import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env");
}

export const supabase = createClient(url, key);

// Calls one of our server functions and gives back a clear error message if it fails.
export async function callFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let payload = {};
    try { payload = await error.context.json(); } catch { /* not JSON */ }
    const err = new Error(payload.error || error.message || "Something went wrong.");
    err.payload = payload;
    throw err;
  }
  return data;
}
