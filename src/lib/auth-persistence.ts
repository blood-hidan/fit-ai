// Controls whether the Supabase session survives a browser/app close.
// The supabase client persists into localStorage by default. When the user
// opts out, we move the keys to sessionStorage on load and clear them on unload.

const FLAG = "mf_keep_logged_in";
const SB_PREFIX = "sb-";

export function setKeepLoggedIn(keep: boolean) {
  try { localStorage.setItem(FLAG, keep ? "1" : "0"); } catch {}
}

export function getKeepLoggedIn(): boolean {
  try { return localStorage.getItem(FLAG) !== "0"; } catch { return true; }
}

function sbKeys(store: Storage): string[] {
  const out: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(SB_PREFIX)) out.push(k);
  }
  return out;
}

export function installSessionPersistenceGuard() {
  // Migrate any leftover session-only data back into local on load.
  try {
    for (const k of sbKeys(sessionStorage)) {
      const v = sessionStorage.getItem(k);
      if (v && !localStorage.getItem(k)) localStorage.setItem(k, v);
      sessionStorage.removeItem(k);
    }
  } catch {}

  // On unload, if user opted out, wipe persisted session.
  window.addEventListener("beforeunload", () => {
    if (!getKeepLoggedIn()) {
      try {
        for (const k of sbKeys(localStorage)) localStorage.removeItem(k);
      } catch {}
    }
  });
}
