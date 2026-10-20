"use client";

import { useEffect, useState } from "react";
import { getPref, setPref } from "@/lib/games/history";
import { cleanCode } from "@/lib/games/net/peer";
import type { RoomStatus } from "@/lib/games/net/room";
import { roomLink, type SessionInfo } from "@/lib/games/useSession";

const NAME_KEY = "games:name";

/** The name you play online under, remembered across games. */
export function useSavedName() {
  const [name, setName] = useState("");
  useEffect(() => {
    getPref<string>(NAME_KEY).then(
      (saved) => saved && setName((n) => n || saved),
      () => {}
    );
  }, []);
  const update = (value: string) => {
    setName(value);
    setPref(NAME_KEY, value.trim()).catch(() => {});
  };
  return [name, update] as const;
}

const PROBLEMS: Record<Extract<RoomStatus, { state: "failed" }>["reason"], string> = {
  offline: "Couldn't reach the server that connects players. Check you're online and try again.",
  "not-found": "Nobody is hosting a game on that code. It may have finished, or the host closed their tab.",
  taken: "That room code is already in use. Start again and you'll get a fresh one.",
  unsupported: "This browser can't make peer-to-peer connections (WebRTC), which online play needs.",
  timeout:
    "The connection took too long. Some office, school and hotel networks block peer-to-peer games; mobile data usually works.",
  full: "That game is full.",
  started: "That game has already started without you.",
  version: "You and the host have different versions of this page open. Reload and try again.",
  closed: "The host ended the game.",
  lost: "Lost the connection to the host, and couldn't get it back.",
};

export const problemText = (status: RoomStatus | null) => (status?.state === "failed" ? PROBLEMS[status.reason] : null);

export function NameField({ name, onName, id }: { name: string; onName: (v: string) => void; id: string }) {
  return (
    <label className="online-field" htmlFor={id}>
      <span>Your name</span>
      <input
        id={id}
        type="text"
        value={name}
        maxLength={16}
        autoComplete="nickname"
        placeholder="So friends know it's you"
        onChange={(e) => onName(e.target.value)}
      />
    </label>
  );
}

/** Joining a game from a link (code filled in) or a code someone read out. */
export function JoinForm({
  title,
  initialCode,
  name,
  onName,
  onJoin,
  onBack,
}: {
  title: string;
  initialCode: string | null;
  name: string;
  onName: (v: string) => void;
  onJoin: (code: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState(initialCode ?? "");
  const clean = cleanCode(code);
  return (
    <form
      className="online-join"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean && name.trim()) onJoin(clean);
      }}
    >
      <p className="section-eyebrow">{title} online</p>
      <h2>{initialCode ? "You've been invited" : "Join a game"}</h2>
      <p className="game-copy">
        {initialCode
          ? "Someone has a seat saved for you. Pick a name and you're in."
          : "Type the six-letter code from the person hosting, or paste their link."}
      </p>
      <NameField id="join-name" name={name} onName={onName} />
      {!initialCode && (
        <label className="online-field" htmlFor="join-code">
          <span>Room code</span>
          <input
            id="join-code"
            className="online-code-input"
            type="text"
            value={code}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="e.g. K7M2QX"
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      )}
      <div className="game-actions">
        <button type="submit" className="btn btn-primary" disabled={!clean || !name.trim()}>
          Join game
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {initialCode ? "Play something else" : "Back"}
        </button>
      </div>
    </form>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm btn-primary"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          },
          () => {}
        )
      }
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** The waiting room: the link to send, who's in, and (for the host) the settings and the start button. */
export function Lobby<C>({
  title,
  info,
  seatColor,
  onStart,
  onLeave,
  children,
}: {
  title: string;
  info: SessionInfo<C>;
  /** A colour per seat, for games where seats have one. */
  seatColor?: (seat: number) => string;
  onStart: () => void;
  onLeave: () => void;
  /** Host-only settings. */
  children?: React.ReactNode;
}) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  const problem = problemText(info.status);
  const host = info.role === "host";
  const code = info.code ?? "";
  const link = code ? roomLink(code) : "";
  const invite = `Come and play ${title} with me: ${link}`;
  const lobby = info.lobby;
  const guests = lobby?.seats.filter((s) => s.kind === "guest").length ?? 0;
  const hostName = lobby?.seats[0]?.name;

  if (problem) {
    return (
      <div className="online-lobby">
        <p className="section-eyebrow">{title} online</p>
        <h2>That didn&apos;t work</h2>
        <p className="game-copy">{problem}</p>
        <div className="game-actions">
          <button type="button" className="btn btn-primary" onClick={onLeave} autoFocus>
            Back to the menu
          </button>
        </div>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="online-lobby">
        <p className="section-eyebrow">{title} online</p>
        <h2>{host ? "Opening a room…" : "Finding the game…"}</h2>
        <p className="game-copy">
          {info.status?.state === "reconnecting" ? "Connection dropped. Getting it back…" : "This usually takes a second or two."}
        </p>
        <div className="online-spinner" aria-hidden="true" />
        <div className="game-actions">
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="online-lobby">
      <p className="section-eyebrow">{title} online</p>
      <h2>{host ? "Send this to a friend" : `${hostName ?? "The host"}'s table`}</h2>
      {host && (
        <>
          <p className="game-copy">They open the link and they&apos;re in. Or read them the code to type in.</p>
          <div className="online-code" aria-label={`Room code ${code.split("").join(" ")}`}>
            {code}
          </div>
          <div className="online-share">
            <CopyButton text={link} label="Copy link" />
            {canShare && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => navigator.share({ title, text: invite, url: link }).catch(() => {})}
              >
                Share…
              </button>
            )}
            <a
              className="btn btn-sm btn-ghost"
              href={`https://wa.me/?text=${encodeURIComponent(invite)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </div>
        </>
      )}

      <ol className="online-seats" aria-label="Seats">
        {lobby.seats.map((seat, i) => (
          <li key={i} className={`online-seat ${seat.kind}${i === lobby.you ? " you" : ""}`}>
            <span className="online-dot" style={seatColor ? { background: seatColor(i) } : undefined} aria-hidden="true" />
            <span className="online-seat-name">
              {seat.kind === "open" ? "Waiting for someone to join…" : seat.kind === "cpu" ? "CPU" : seat.name}
              {i === lobby.you && <em> (you)</em>}
            </span>
            <span className="online-seat-tag">
              {seat.kind === "host" ? "Host" : seat.kind === "guest" ? (seat.online ? "Here" : "Dropped") : seat.kind === "open" ? "Open" : ""}
            </span>
          </li>
        ))}
      </ol>

      {host ? (
        <>
          {children}
          <p className="game-keys">
            {guests ? "Seats still open when you start are played by the CPU." : "Start opens up once someone has joined."}
          </p>
          <div className="game-actions">
            <button type="button" className="btn btn-primary" onClick={onStart} disabled={!guests}>
              Start game
            </button>
            <button type="button" className="btn btn-ghost" onClick={onLeave}>
              Close room
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="game-copy online-wait">
            You&apos;re in. Waiting for {hostName ?? "the host"} to start
            <span className="online-ellipsis" aria-hidden="true" />
          </p>
          <div className="game-actions">
            <button type="button" className="btn btn-ghost" onClick={onLeave}>
              Leave
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** A strip across the top of the table when someone online has dropped. */
export function DropNotice({
  info,
  onCpu,
}: {
  info: SessionInfo<unknown>;
  /** Host only: give the dropped seat to the CPU. */
  onCpu: (seat: number) => void;
}) {
  if (info.role === "guest" && info.status?.state === "reconnecting") {
    return <p className="online-notice">Lost the host for a moment. Reconnecting…</p>;
  }
  const dropped = info.seats.findIndex((s) => s.kind === "person" && !s.online);
  if (dropped < 0) return null;
  const name = info.seats[dropped].name;
  return (
    <p className="online-notice">
      {name} dropped out. Waiting for them to come back
      {info.role === "host" && (
        <button type="button" className="game-link" onClick={() => onCpu(dropped)}>
          Let the CPU play for {name}
        </button>
      )}
    </p>
  );
}
