/**
 * Browser-to-browser connections for online play, over WebRTC data channels
 * with PeerJS. The only server involved is PeerJS's free public broker, which
 * introduces the two browsers to each other; after that, moves travel
 * directly between them (or through PeerJS's TURN relay when a network won't
 * allow a direct path). The site itself needs no backend.
 *
 * Set NEXT_PUBLIC_PEER_SERVER (e.g. "https://peer.example.com:443/myapp") to
 * use your own PeerServer instead of the public one.
 */
import type { DataConnection, Peer, PeerOptions } from "peerjs";

const NAMESPACE = "akinroye-games";
/** No I, L, O, 0 or 1, so a code read out loud can't be misheard. */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
/** Both ends send something at least this often... */
const HEARTBEAT = 2500;
/** ...so this much silence means the other side has gone. */
const SILENCE = 12000;

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

/** A code as typed or pasted (lower case, spaces, a whole link), or null if it isn't one. */
export function cleanCode(input: string) {
  const fromLink = /[?&]room=([^&#]+)/.exec(input)?.[1] ?? input;
  const code = fromLink.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === CODE_LENGTH && [...code].every((ch) => CODE_CHARS.includes(ch)) ? code : null;
}

const hostId = (game: string, code: string) => `${NAMESPACE}-${game}-${code}`;

function options(): PeerOptions {
  const custom = process.env.NEXT_PUBLIC_PEER_SERVER;
  if (!custom) return {};
  try {
    const url = new URL(custom);
    return {
      host: url.hostname,
      port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname,
      secure: url.protocol === "https:",
    };
  } catch {
    return {};
  }
}

async function createPeer(id?: string): Promise<Peer> {
  const { Peer } = await import("peerjs");
  return id ? new Peer(id, options()) : new Peer(options());
}

/** One live link to another browser, carrying JSON messages. */
export type Channel = {
  send(message: object): void;
  close(): void;
  onMessage: (message: unknown) => void;
  onClose: () => void;
};

function channel(conn: DataConnection): Channel {
  let heard = Date.now();
  let closed = false;
  const ch: Channel = {
    send(message) {
      if (closed) return;
      try {
        conn.send(message);
      } catch {
        end();
      }
    },
    close: () => end(),
    onMessage: () => {},
    onClose: () => {},
  };
  const beat = setInterval(() => {
    if (Date.now() - heard > SILENCE) end();
    else ch.send({ t: "beat" });
  }, HEARTBEAT);
  function end() {
    if (closed) return;
    closed = true;
    clearInterval(beat);
    try {
      conn.close();
    } catch {
      // Already gone.
    }
    ch.onClose();
  }
  conn.on("data", (data) => {
    heard = Date.now();
    if ((data as { t?: string } | null)?.t !== "beat") ch.onMessage(data);
  });
  conn.on("close", end);
  conn.on("error", end);
  return ch;
}

export type NetError =
  /** Couldn't reach the broker that introduces browsers. */
  | "offline"
  /** No host is listening on that code. */
  | "not-found"
  /** The code is already being hosted, by another tab or someone else. */
  | "taken"
  | "unsupported"
  | "timeout";

export class NetFailure extends Error {
  constructor(public reason: NetError) {
    super(reason);
  }
}

const reasonFor = (type: string): NetError =>
  type === "peer-unavailable"
    ? "not-found"
    : type === "unavailable-id"
      ? "taken"
      : type === "browser-incompatible"
        ? "unsupported"
        : "offline";

/** Resolves once the broker has registered the peer. Only errors before then count as failing to open. */
function opened(peer: Peer) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      peer.off("open", onOpen);
      peer.off("error", onError);
    };
    const onOpen = () => {
      done();
      resolve();
    };
    const onError = (err: { type: string }) => {
      done();
      peer.destroy();
      reject(new NetFailure(reasonFor(err.type)));
    };
    const timer = setTimeout(() => {
      done();
      peer.destroy();
      reject(new NetFailure("timeout"));
    }, 15000);
    peer.on("open", onOpen);
    peer.on("error", onError);
  });
}

/**
 * Listens for guests on a room code. Resolves once the broker has registered
 * the code, and keeps the registration alive if the broker connection drops.
 */
export async function listen(game: string, code: string, onGuest: (ch: Channel) => void) {
  const peer = await createPeer(hostId(game, code));
  await opened(peer);

  let closed = false;
  peer.on("connection", (conn) => conn.on("open", () => onGuest(channel(conn))));
  // Games already open carry on without the broker; it only matters for new guests.
  peer.on("disconnected", () => {
    if (!closed) setTimeout(() => !closed && !peer.destroyed && peer.disconnected && peer.reconnect(), 2000);
  });
  // Errors after opening (a guest's connection failing, the broker blinking) aren't fatal.
  peer.on("error", () => {});

  return {
    close() {
      closed = true;
      peer.destroy();
    },
  };
}

/** A guest's side: one peer that can dial the host, and redial after a drop. */
export async function dialer(game: string, code: string) {
  const peer = await createPeer();
  await opened(peer);
  peer.on("error", () => {});

  /** Back on the broker after a drop, if it went. */
  const online = () =>
    new Promise<void>((resolve, reject) => {
      if (peer.destroyed) return reject(new NetFailure("offline"));
      if (!peer.disconnected) return resolve();
      const timer = setTimeout(() => {
        peer.off("open", onOpen);
        reject(new NetFailure("offline"));
      }, 6000);
      const onOpen = () => {
        clearTimeout(timer);
        resolve();
      };
      peer.once("open", onOpen);
      peer.reconnect();
    });

  return {
    async dial() {
      await online();
      return new Promise<Channel>((resolve, reject) => {
        const conn = peer.connect(hostId(game, code), { reliable: true, serialization: "json" });
        if (!conn) return reject(new NetFailure("offline"));
        const finish = () => {
          clearTimeout(timer);
          peer.off("error", onError);
        };
        const onError = (err: { type: string }) => {
          finish();
          conn.close();
          reject(new NetFailure(reasonFor(err.type)));
        };
        const timer = setTimeout(() => {
          finish();
          conn.close();
          reject(new NetFailure("timeout"));
        }, 12000);
        peer.on("error", onError);
        conn.on("open", () => {
          finish();
          resolve(channel(conn));
        });
      });
    },
    close: () => peer.destroy(),
  };
}
