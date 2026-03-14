import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isEpisodeEditorActive } from "@/lib/episodeDraft";

const STORAGE_SYNC_INTERVAL_MS = 15 * 60 * 1000;

export const STORAGE_USAGE_SYNC_EVENT = "storage-usage-synced";

interface StorageUsageHeartbeatOptions {
  enabled: boolean;
  scopeKey: string;
}

export function useStorageUsageHeartbeat({
  enabled,
  scopeKey,
}: StorageUsageHeartbeatOptions) {
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const storageKey = `storage-usage-last-sync:${scopeKey}`;

    const runSync = async (ignoreVisibility = false) => {
      if (inFlightRef.current) return;
      if (isEpisodeEditorActive()) return;
      if (!ignoreVisibility && document.hidden) return;

      const lastSyncedAt = Number(window.localStorage.getItem(storageKey) || 0);
      if (lastSyncedAt && Date.now() - lastSyncedAt < STORAGE_SYNC_INTERVAL_MS) {
        return;
      }

      inFlightRef.current = true;
      try {
        const { data, error } = await supabase.functions.invoke("r2-assets", {
          body: { action: "sync-usage" },
        });

        if (error) throw error;

        const syncedAt = data?.synced_at || new Date().toISOString();
        window.localStorage.setItem(storageKey, String(Date.now()));
        window.dispatchEvent(
          new CustomEvent(STORAGE_USAGE_SYNC_EVENT, {
            detail: {
              syncedAt,
              summary: data?.summary || null,
              removedMetadataCount: data?.removed_metadata_count || 0,
              scannedObjectCount: data?.scanned_object_count || 0,
            },
          }),
        );
      } catch (error) {
        console.error("Storage usage sync failed:", error);
      } finally {
        inFlightRef.current = false;
      }
    };

    void runSync();

    const intervalId = window.setInterval(() => {
      void runSync();
    }, STORAGE_SYNC_INTERVAL_MS);

    const handleVisibility = () => {
      if (!document.hidden && !isEpisodeEditorActive()) {
        void runSync();
      }
    };

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, scopeKey]);
}
