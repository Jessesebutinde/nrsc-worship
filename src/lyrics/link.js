// The link between the remote(s) and the output(s) of one room (the pairing code).
//
// Three transports, used together:
// - a BroadcastChannel: windows of one browser (the operator laptop and its TV / ATEM windows);
// - a relay: Supabase Realtime when src/lyrics/config.js has a project, else the public MQTT
//   broker, so a laptop or phone can drive a TV or a PC anywhere with internet and no account;
// - "ports": Cast (Presentation API) connections, added with addPort().
// Messages: { t: 'hello' | 'here' | 'state', id, role, state? }.
// Whoever has the newest state answers a 'hello', so a refreshed screen or remote catches up.
// The relay also keeps the last state (an MQTT retained message), so a TV that opens the link
// later shows the right thing at once.

import { RealtimeChannel } from './realtime.js';
import { MqttClient } from './mqtt.js';
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
   * @param {{kind: 'supabase', url, key} | {kind: 'mqtt', urls: string[]} | null} [o.relay]
   */
  constructor({ room, role, state = null, onState, onInfo = () => {}, relay = null, BroadcastChannelImpl, WebSocketImpl }) {
    this.room = room;
    this.role = role;
    this.id = clientId();
    this.state = state;
    this.onState = onState;
    this.onInfo = onInfo;
    this.peers = new Map();
    this.ports = new Set();
    this.pending = false;
    this.cloudStatus = relay ? 'connecting' : 'off';

    const BC = BroadcastChannelImpl || globalThis.BroadcastChannel;
    if (BC) {
      this.bc = new BC(`lyric-slides:${room}`);
      this.bc.onmessage = (e) => this.receive(e.data);
    }
    const onStatus = (s) => {
      this.cloudStatus = s;
      if (s === 'joined') {
        this.post({ t: 'hello' });
        if (this.pending && this.state) this.publish(this.state);
      }
      this.info();
    };
    if (relay && relay.kind === 'supabase') {
      this.rt = new RealtimeChannel({
        url: relay.url,
        key: relay.key,
        topic: `lyric-slides-${room}`,
        WebSocketImpl,
        onMessage: (m) => this.receive(m),
        onStatus,
      });
    } else if (relay && relay.kind === 'mqtt') {
      this.topic = `nrsc/lyric-slides/${room}`;
      this.mq = new MqttClient({
        urls: relay.urls,
        topics: [`${this.topic}/msg`, `${this.topic}/state`],
        WebSocketImpl,
        onMessage: (topic, payload) => {
          try {
            this.receive(JSON.parse(payload));
          } catch {
            /* not ours */
          }
        },
        onStatus,
      });
    }
    this.post({ t: 'hello' });
    this.timer = setInterval(() => {
      this.post({ t: 'here' });
      this.info();
    }, HERE_MS);
    this.onOnline = () => {
      if (this.rt) this.rt.kick();
      if (this.mq) this.mq.kick();
    };
    globalThis.addEventListener?.('online', this.onOnline);
  }

  /** A Cast connection (or anything with send(string) and onmessage). */
  addPort(port) {
    this.ports.add(port);
    port.onmessage = (e) => {
      try {
        this.receive(JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    };
    port.onclose = () => {
      this.ports.delete(port);
      this.info();
    };
    port.onterminate = port.onclose;
    this.post({ t: 'hello' });
    if (this.state && this.state.rev) this.post({ t: 'state', state: this.state });
    this.info();
  }

  post(msg) {
    const m = { ...msg, id: this.id, role: this.role };
    if (this.bc) this.bc.postMessage(m);
    if (this.rt) this.rt.send(m);
    if (this.mq) {
      const retain = m.t === 'state';
      this.mq.publish(`${this.topic}/${retain ? 'state' : 'msg'}`, JSON.stringify(m), retain);
    }
    for (const p of this.ports) {
      try {
        p.send(JSON.stringify(m));
      } catch {
        this.ports.delete(p);
      }
    }
  }

  receive(m) {
    if (!m || !m.id || m.id === this.id) return;
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

  get relayUp() {
    if (this.rt) return this.rt.joined;
    if (this.mq) return this.mq.joined;
    return true;
  }

  /** Publish a new state (already applied locally). Kept and resent if the relay is down. */
  publish(state) {
    this.state = state;
    this.post({ t: 'state', state });
    this.pending = !this.relayUp;
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
    this.onInfo({ peers: this.counts(), cloud: this.cloudStatus, pending: this.pending, ports: this.ports.size });
  }

  close() {
    clearInterval(this.timer);
    globalThis.removeEventListener?.('online', this.onOnline);
    if (this.bc) this.bc.close();
    if (this.rt) this.rt.close();
    if (this.mq) this.mq.close();
    for (const p of this.ports) {
      try {
        p.close();
      } catch {
        /* already gone */
      }
    }
  }
}
