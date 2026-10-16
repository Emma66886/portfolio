"use client";

import { useState } from "react";

/**
 * The frame every game's history sits in: heading, clear-with-confirm, the
 * loading, empty and storage-blocked states, and the privacy note. The game
 * supplies the stats and list as children.
 */
export default function HistoryPanel({
  title,
  status,
  count,
  noun,
  onClear,
  children,
}: {
  title: string;
  status: "loading" | "ready" | "unavailable";
  count: number;
  /** What one record is called, plural: "matches", "games". */
  noun: string;
  onClear: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history-head">
        <div>
          <p className="section-eyebrow">Your history</p>
          <h2 id="history-title">{title}</h2>
        </div>
        {count > 0 &&
          (confirming ? (
            <div className="history-confirm" role="group" aria-label="Confirm clearing history">
              <span>
                Delete all {count} {noun}?
              </span>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => onClear().then(() => setConfirming(false))}
              >
                Delete
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" className="history-clear" onClick={() => setConfirming(true)}>
              Clear history
            </button>
          ))}
      </div>

      {status === "loading" && <p className="history-note">Loading your {noun}…</p>}

      {status === "unavailable" && (
        <p className="history-note">
          This browser is blocking site storage (a private window will often do this), so there&apos;s
          no history to show and new {noun} won&apos;t be kept.
        </p>
      )}

      {status === "ready" && count === 0 && (
        <p className="history-note">
          Nothing here yet. Finish a game and it&apos;ll show up here, and it&apos;ll still be here next
          time you visit.
        </p>
      )}

      {count > 0 && children}

      <p className="history-privacy">
        Stored with IndexedDB in this browser only. Nothing is sent to a server, and clearing your site
        data removes it.
      </p>
    </section>
  );
}
