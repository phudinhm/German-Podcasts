"use client";

import { useCallback, useEffect, useState } from "react";
import { useUi } from "@/lib/i18n";
import { isSyncConfigured, signIn, signOut, signedIn, syncNow } from "@/lib/googleSync";

/**
 * Optional sign-in, so a library follows the listener between devices.
 *
 * It stores nothing on our side: the file lives in the listener's own Google
 * Drive, in the hidden folder only this app can see. That is why there is no
 * account to create and no password to forget - and why signing out leaves the
 * local library exactly where it was.
 */
export function GoogleSync() {
  const { t } = useUi();
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    setConfigured(isSyncConfigured());
    setConnected(signedIn());
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await syncNow();
      setSyncedAt(new Date().toLocaleTimeString());
      setConnected(true);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }, []);

  // Nothing to offer without a client id, and a dead button is worse than no
  // button: it promises something the deployment cannot do.
  if (!configured) return null;

  return (
    <div className="surface flex flex-wrap items-center gap-2 p-3">
      <span className="text-[12.5px] text-[var(--ink-soft)]">
        {connected ? t("sync.connected") : t("sync.offer")}
      </span>

      {connected ? (
        <>
          <button type="button" className="btn px-2.5 py-1 text-[12px]" disabled={busy} onClick={() => void run()}>
            {busy ? t("sync.working") : t("sync.now")}
          </button>
          <button
            type="button"
            className="text-[12px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
            onClick={() => {
              signOut();
              setConnected(false);
              setSyncedAt(null);
            }}
          >
            {t("sync.signOut")}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-primary px-3 py-1 text-[12px]"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const token = await signIn(true);
            setBusy(false);
            if (token) void run();
            else setError(t("sync.refused"));
          }}
        >
          {t("sync.signIn")}
        </button>
      )}

      {syncedAt ? <span className="text-[11.5px] text-[var(--ink-faint)]">{syncedAt}</span> : null}
      {error ? <span className="text-[11.5px] text-rose-600">{error}</span> : null}
    </div>
  );
}
