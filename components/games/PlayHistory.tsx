"use client";

import { useState } from "react";
import { formatDuration, fullDate, timeAgo } from "@/lib/games/format";
import { summarize, type MatchRecord } from "@/lib/games/history";

const SHOWN = 8;
const LEVELS: Record<string, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

export default function PlayHistory({
  matches,
  status,
  onClear,
}: {
  matches: MatchRecord[];
  status: "loading" | "ready" | "unavailable";
  onClear: () => Promise<void>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const stats = summarize(matches);
  const list = showAll ? matches : matches.slice(0, SHOWN);

  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history-head">
        <div>
          <p className="section-eyebrow">Your history</p>
          <h2 id="history-title">Every match you&apos;ve finished</h2>
        </div>
        {matches.length > 0 &&
          (confirming ? (
            <div className="history-confirm" role="group" aria-label="Confirm clearing history">
              <span>Delete all {matches.length} matches?</span>
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

      {status === "loading" && <p className="history-note">Loading your matches…</p>}

      {status === "unavailable" && (
        <p className="history-note">
          This browser is blocking site storage (a private window will often do this), so there&apos;s
          no history to show and new matches won&apos;t be kept.
        </p>
      )}

      {status === "ready" && matches.length === 0 && (
        <p className="history-note">
          Nothing here yet. Finish a match and it&apos;ll show up here, and it&apos;ll still be here
          next time you visit.
        </p>
      )}

      {matches.length > 0 && (
        <>
          <ul className="history-stats">
            <li>
              <strong>{stats.played}</strong>
              <span>Played</span>
            </li>
            <li>
              <strong>
                {stats.wins}-{stats.losses}
              </strong>
              <span>Won-lost</span>
            </li>
            <li>
              <strong>{Math.round(stats.winRate * 100)}%</strong>
              <span>Win rate</span>
            </li>
            <li>
              <strong>{stats.bestWinStreak}</strong>
              <span>Best win streak</span>
            </li>
            <li>
              <strong>{stats.longestRally}</strong>
              <span>Longest rally</span>
            </li>
          </ul>
          {stats.streak && stats.streak.count > 1 && (
            <p className="history-streak">
              {stats.streak.result === "win"
                ? `You've won your last ${stats.streak.count} in a row.`
                : `The CPU has taken the last ${stats.streak.count}. Maybe drop a level?`}
            </p>
          )}

          <ol className="history-list">
            {list.map((m) => (
              <li key={m.id} className={`history-row ${m.result}`}>
                <span className="history-badge" aria-label={m.result === "win" ? "Won" : "Lost"}>
                  {m.result === "win" ? "W" : "L"}
                </span>
                <span className="history-score">
                  {m.playerScore}-{m.opponentScore}
                </span>
                <span className="history-detail">
                  {LEVELS[m.difficulty] ?? m.difficulty} · first to {m.target}
                </span>
                <span className="history-detail">
                  Rally {m.longestRally} · {formatDuration(m.duration)}
                </span>
                <time className="history-when" dateTime={new Date(m.endedAt).toISOString()} title={fullDate(m.endedAt)}>
                  {timeAgo(m.endedAt)}
                </time>
              </li>
            ))}
          </ol>
          {matches.length > SHOWN && (
            <button type="button" className="history-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${matches.length}`}
            </button>
          )}
        </>
      )}

      <p className="history-privacy">
        Stored with IndexedDB in this browser only. Nothing is sent to a server, and clearing your site
        data removes it.
      </p>
    </section>
  );
}
