import { AsyncLocalStorage } from "node:async_hooks";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditContext = {
  /** Service-role client. Insert-only use inside the wrapper. */
  supabaseAdmin: SupabaseClient<Database>;
  userId: string | null;
  sessionId: string | null;
};

const storage = new AsyncLocalStorage<AuditContext>();

export const auditContext = {
  run<T>(ctx: AuditContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): AuditContext | undefined {
    return storage.getStore();
  },
};
