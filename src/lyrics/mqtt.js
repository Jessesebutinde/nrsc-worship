// A very small MQTT 3.1.1 client over WebSocket: connect, subscribe, publish (QoS 0, with retain),
// ping. Enough for the public relay that lets a laptop or phone drive a TV without any account.

const enc = new TextEncoder();
const dec = new TextDecoder();

function str(s) {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

function remainingLength(n) {
  const out = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 128;
    out.push(byte);
  } while (n > 0);
  return out;
}

export function packet(type, body) {
  return new Uint8Array([type, ...remainingLength(body.length), ...body]);
}

export const connectPacket = (clientId, keepalive = 30) =>
  packet(0x10, [...str('MQTT'), 4, 0x02, keepalive >> 8, keepalive & 255, ...str(clientId)]);

export const subscribePacket = (id, topics) => packet(0x82, [id >> 8, id & 255, ...topics.flatMap((t) => [...str(t), 0])]);

export const publishPacket = (topic, payload, retain = false) =>
  packet(0x30 | (retain ? 1 : 0), [...str(topic), ...enc.encode(payload)]);

export const PING = new Uint8Array([0xc0, 0]);
export const DISCONNECT = new Uint8Array([0xe0, 0]);

/** Splits a byte stream into packets: returns [{ type, body }...] and the unread tail. */
export function parsePackets(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const type = bytes[i];
    let j = i + 1;
    let len = 0;
    let mult = 1;
    let byte;
    do {
      if (j >= bytes.length) return { packets: out, rest: bytes.slice(i) };
      byte = bytes[j++];
      len += (byte & 127) * mult;
      mult *= 128;
    } while (byte & 128);
    if (j + len > bytes.length) return { packets: out, rest: bytes.slice(i) };
    out.push({ type, body: bytes.slice(j, j + len) });
    i = j + len;
  }
  return { packets: out, rest: new Uint8Array(0) };
}

/** A PUBLISH body -> { topic, payload (string), retain }. */
export function parsePublish(type, body) {
  const tlen = (body[0] << 8) | body[1];
  return { topic: dec.decode(body.slice(2, 2 + tlen)), payload: dec.decode(body.slice(2 + tlen)), retain: Boolean(type & 1) };
}

export class MqttClient {
  /**
   * @param {object} o
   * @param {string[]} o.urls      brokers to try in turn (wss://…)
   * @param {string[]} o.topics    subscriptions
   * @param {(topic: string, payload: string, retain: boolean) => void} o.onMessage
   * @param {(status: 'connecting'|'joined'|'closed') => void} [o.onStatus]
   */
  constructor({ urls, topics, onMessage, onStatus = () => {}, WebSocketImpl = globalThis.WebSocket, keepalive = 30 }) {
    this.urls = urls;
    this.topics = topics;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.WS = WebSocketImpl;
    this.keepalive = keepalive;
    this.which = 0;
    this.tries = 0;
    this.joined = false;
    this.closed = false;
    this.rest = new Uint8Array(0);
    this.connect();
  }

  connect() {
    if (this.closed) return;
    this.onStatus('connecting');
    const url = this.urls[this.which % this.urls.length];
    let ws;
    try {
      ws = new this.WS(url, ['mqtt']);
    } catch {
      this.retry();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.rest = new Uint8Array(0);
      ws.send(connectPacket(`ls-${Math.random().toString(36).slice(2, 10)}`, this.keepalive));
    };
    ws.onmessage = (e) => {
      const chunk = new Uint8Array(e.data);
      const all = new Uint8Array(this.rest.length + chunk.length);
      all.set(this.rest);
      all.set(chunk, this.rest.length);
      const { packets, rest } = parsePackets(all);
      this.rest = rest;
      for (const p of packets) this.handle(p, ws);
    };
    ws.onclose = () => {
      clearInterval(this.hb);
      if (this.ws !== ws) return;
      this.joined = false;
      this.onStatus('closed');
      this.retry();
    };
    ws.onerror = () => {};
  }

  handle({ type, body }, ws) {
    const kind = type >> 4;
    if (kind === 2) {
      // CONNACK
      if (body[1] !== 0) {
        ws.close();
        return;
      }
      ws.send(subscribePacket(1, this.topics));
      clearInterval(this.hb);
      this.hb = setInterval(() => ws.readyState === 1 && ws.send(PING), (this.keepalive * 1000) / 2);
    } else if (kind === 9) {
      // SUBACK
      this.tries = 0;
      this.joined = true;
      this.onStatus('joined');
    } else if (kind === 3) {
      const m = parsePublish(type, body);
      this.onMessage(m.topic, m.payload, m.retain);
    }
  }

  retry() {
    if (this.closed) return;
    // Another broker after two failed tries on this one.
    this.tries += 1;
    if (this.tries % 2 === 0) this.which += 1;
    const delay = Math.min(15000, 500 * 2 ** Math.min(this.tries - 1, 5));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  publish(topic, payload, retain = false) {
    if (!this.joined || this.ws.readyState !== 1) return false;
    this.ws.send(publishPacket(topic, payload, retain));
    return true;
  }

  kick() {
    if (this.joined || this.closed) return;
    this.tries = 0;
    clearTimeout(this.timer);
    if (this.ws && this.ws.readyState <= 1) return;
    this.connect();
  }

  close() {
    this.closed = true;
    clearInterval(this.hb);
    clearTimeout(this.timer);
    if (this.ws && this.ws.readyState === 1) this.ws.send(DISCONNECT);
    if (this.ws) this.ws.close();
  }
}
