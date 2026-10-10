// The link between the remote(s) and the screen(s) of one room (the pairing code).
//
// Two transports, used together: a BroadcastChannel (windows of one browser, e.g. the operator
// laptop and its fullscreen TV window) and Supabase Realtime when configured (phone <-> hall PC).
// Messages: { t: 'hello' | 'here' | 'state', id, role, state? }.
// Whoever has the newest state answers a 'hello', so a refreshed screen or remote catches up.

import { RealtimeChannel } from './realtime.js';
import { newer } from './state.js';

const HERE_MS = 8000;
const GONE_MS = 20000;

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newCode(len = 6, rand = Math.random) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function clientId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export class Link {
  /**
   * @param {object} o
   * @param {string} o.room
   * @param {'screen'|'remote'} o.role
   * @param {object} [o.state]       last known state (e.g. from localStorage)
   * @param {(state) => void} o.onState
   * @param {(info) => void} [o.onInfo]  { peers: {screen, remote}, cloud: 'off'|'connecting'|'joined'|'closed', pending }
   * @param {{url: string, key: string} | null} [o.cloud]
   */
  constructor({ room, role, state = null, onState, onInfo = () => {}, cloud = null, BroadcastChannelImpl, WebSocketImpl }) {
    this.room = room;
    this.role = role;
    this.id = clientId();
    this.state = state;
    this.onState = onState;
    this.onInfo = onInfo;
    this.peers = new Map();
    this.pending = false;
    this.cloudStatus = cloud ? 'connecting' : 'off';

    const BC = BroadcastChannelImpl || globalThis.BroadcastChannel;
    if (BC) {
      this.bc = new BC(`lyric-slides:${room}`);
      this.bc.onmessage = (e) => this.receive(e.data);
    }
    if (cloud && cloud.url && cloud.key) {
      this.rt = new RealtimeChannel({
        url: cloud.url,
        key: cloud.key,
        topic: `lyric-slides-${room}`,
        WebSocketImpl,
        onMessage: (m) => this.receive(m),
        onStatus: (s) => {
          this.cloudStatus = s;
          if (s === 'joined') {
            this.post({ t: 'hello' });
            if (this.pending && this.state) this.post({ t: 'state', state: this.state });
          }
          this.info();
        },
      });
    }
    this.post({ t: 'hello' });
    this.timer = setInterval(() => {
      this.post({ t: 'here' });
      this.info();
    }, HERE_MS);
    this.onOnline = () => this.rt && this.rt.kick();
    globalThis.addEventListener?.('online', this.onOnline);
  }

  post(msg) {
    const m = { ...msg, id: this.id, role: this.role };
    if (this.bc) this.bc.postMessage(m);
    if (this.rt) this.rt.send(m);
  }

  receive(m) {
    if (!m || m.id === this.id) return;
    this.peers.set(m.id, { role: m.role, at: Date.now() });
    if (m.t === 'hello') {
      this.post({ t: 'here' });
      if (this.state && this.state.rev) this.post({ t: 'state', state: this.state });
    } else if (m.t === 'state' && newer(m.state, this.state)) {
      this.state = m.state;
      this.onState(m.state);
    }
    this.info();
  }

  /** Publish a new state (already applied locally). Kept and resent if the cloud link is down. */
  publish(state) {
    this.state = state;
    const cloudUp = !this.rt || this.rt.joined;
    this.post({ t: 'state', state });
    this.pending = !cloudUp;
    this.info();
  }

  counts() {
    const now = Date.now();
    const c = { screen: 0, remote: 0 };
    for (const [id, p] of this.peers) {
      if (now - p.at > GONE_MS) this.peers.delete(id);
      else c[p.role] = (c[p.role] || 0) + 1;
    }
    return c;
  }

  info() {
    this.onInfo({ peers: this.counts(), cloud: this.cloudStatus, pending: this.pending });
  }

  close() {
    clearInterval(this.timer);
    globalThis.removeEventListener?.('online', this.onOnline);
    if (this.bc) this.bc.close();
    if (this.rt) this.rt.close();
  }
}
