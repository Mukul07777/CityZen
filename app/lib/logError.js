import { supabase } from "./supabase";

// Writes a client-side error to public.error_logs (migration 10) instead
// of letting it vanish into the browser console. Best-effort only — if
// the log write itself fails (e.g. offline), we swallow it rather than
// throwing from inside error-handling code.
export async function logError(context, error) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("error_logs").insert({
      user_id: user?.id ?? null,
      context,
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
  } catch {
    // Logging failed silently — don't compound the original error.
  }

  console.error(`[${context}]`, error);
}
