import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  getSupabaseEnv,
  getSupabaseServiceRoleKey,
} from "@/src/lib/supabase/env";

/**
 * Privileged Auth client for hard-deleting identities.
 * Requires SUPABASE_SERVICE_ROLE_KEY — never expose to the browser.
 */
export function createAdminClient() {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!serviceRoleKey) {
    return null;
  }
  const { url } = getSupabaseEnv();
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
