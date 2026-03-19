import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";

interface AppLogInput {
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  event?: string | null;
  path?: string | null;
  userId?: string | null;
  requestId?: string | null;
  context?: Json;
}

export async function writeAppLog(input: AppLogInput) {
  const payload: TablesInsert<"app_logs"> = {
    level: input.level,
    source: input.source,
    message: input.message,
    event: input.event ?? null,
    path: input.path ?? null,
    user_id: input.userId ?? null,
    request_id: input.requestId ?? null,
    context: input.context ?? {},
  };

  const { error } = await supabase.from("app_logs").insert(payload);
  if (error) {
    console.error("writeAppLog failed", error);
  }
}
