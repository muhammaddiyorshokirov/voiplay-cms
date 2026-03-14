export const EPISODE_EDITOR_ACTIVE_KEY = "voiplay:episode-editor-active";

export function setEpisodeEditorActive(active: boolean) {
  if (typeof window === "undefined") return;

  if (active) {
    window.sessionStorage.setItem(EPISODE_EDITOR_ACTIVE_KEY, "1");
    return;
  }

  window.sessionStorage.removeItem(EPISODE_EDITOR_ACTIVE_KEY);
}

export function isEpisodeEditorActive() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(EPISODE_EDITOR_ACTIVE_KEY) === "1";
}

export function readSessionDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : null;
  } catch {
    return null;
  }
}

export function writeSessionDraft(key: string, value: unknown) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota or serialization issues and keep the editor usable.
  }
}

export function clearSessionDraft(key: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(key);
}
