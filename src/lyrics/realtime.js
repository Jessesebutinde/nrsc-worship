// Minimal Supabase Realtime "broadcast" client (Phoenix channels over a WebSocket), so the
// remote and the screen can talk across devices without bundling supabase-js.
// Reconnects by itself, with backoff, and rejoins the channel.

const HEARTBEAT_MS = 25000;

export class RealtimeChannel {
  /**
   * @param {object} o
   * @param {string} o.url       Supabase project URL
   * @param {string} o.key       anon key
   * @param {string} o.topic     channel name
   * @param {(msg: object) => void} o.onMessage
   * @param {(status: 'connecting'|'joined'|'closed') => void} [o.onStatus]
   * @param {typeof WebSocket} [o.WebSocketImpl]
   */
  constructor({ url, key, topic, onMessage, onStatus = () => {}, WebSocketImpl = globalThis.WebSocket }) {
    this.endpoint = `${url.replace(/^http/, 'ws').replace(/\/$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
    this.key = key;
    this.topic = `realtime:${topic}`;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.WS = WebSocketImpl;
    this.ref = 0;
    this.joinRef = null;
    this.joined = false;
    this.closed = false;
    this.tries = 0;
    this.connect();
  }

  status(s) {
    this.state = s;
    this.onStatus(s);
  }

  nextRef() {
    this.ref += 1;
    return String(this.ref);
  }

  connect() {
    if (this.closed) return;
    this.status('connecting');
    let ws;
    try {
      ws = new this.WS(this.endpoint);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      this.joinRef = this.nextRef();
      this.raw({
        topic: this.topic,
        event: 'phx_join',
        payload: {
          config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [], private: false },
          access_token: this.key,
        },
        ref: this.joinRef,
        join_ref: this.joinRef,
      });
      clearInterval(this.hb);
      this.hb = setInterval(() => this.raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: this.nextRef() }), HEARTBEAT_MS);
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.topic !== this.topic) return;
      if (m.event === 'phx_reply' && m.ref === this.joinRef) {
        if (m.payload && m.payload.status === 'ok') {
          this.joined = true;
          this.status('joined');
        } else {
          ws.close();
        }
      } else if (m.event === 'broadcast' && m.payload && m.payload.event === 'msg') {
        this.onMessage(m.payload.payload);
      } else if (m.event === 'phx_error' || m.event === 'phx_close') {
        ws.close();
      }
    };
    ws.onclose = () => {
      clearInterval(this.hb);
      if (this.ws !== ws) return;
      this.joined = false;
      this.status('closed');
      this.retry();
    };
    ws.onerror = () => {};
  }

  retry() {
    if (this.closed) return;
    const delay = Math.min(15000, 500 * 2 ** this.tries++);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  raw(obj) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  /** Returns false when not connected (the caller keeps it and resends on rejoin). */
  send(payload) {
    if (!this.joined) return false;
    return this.raw({
      topic: this.topic,
      event: 'broadcast',
      payload: { type: 'broadcast', event: 'msg', payload },
      ref: this.nextRef(),
      join_ref: this.joinRef,
    });
  }

  /** Reconnect now (e.g. the phone came back online). */
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
    if (this.ws) this.ws.close();
  }
}
