// Page helpers shared by every screen. Needs shared.js loaded first.
(function () {
  'use strict';
  var W = window.NRSCWorship;

  var mem = {};
  var store = {
    get: function (k, def, s) {
      try { var v = (s || localStorage).getItem(k); return v == null ? def : JSON.parse(v); }
      catch (e) { return k in mem ? mem[k] : def; }
    },
    set: function (k, v, s) {
      mem[k] = v;
      try { v == null ? (s || localStorage).removeItem(k) : (s || localStorage).setItem(k, JSON.stringify(v)); } catch (e) { /* full or private mode */ }
    },
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function $(sel, root) { return (root || document).querySelector(sel); }

  var SETUP = { no_db: 1, no_tables: 1, bad_key: 1, db_unreachable: 1, no_pin: 1 };

  // fetch JSON with a timeout. Throws { code, message, fields?, status }.
  // Marks the page "offline" when the service worker answered from its saved copy.
  async function api(path, opts) {
    opts = opts || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, opts.timeout || 20000);
    var headers = { 'content-type': 'application/json' };
    if (opts.pin) headers['x-admin-pin'] = opts.pin;
    var r;
    try {
      r = await fetch(path, {
        method: opts.method || (opts.body ? 'POST' : 'GET'),
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl ? ctrl.signal : undefined,
        cache: opts.fresh ? 'no-store' : 'default',
      });
    } catch (e) {
      throw {
        code: 'offline',
        message: navigator.onLine === false ? "You're offline. Connect to the internet and try again."
          : (e && e.name === 'AbortError' ? 'The connection is very slow — it timed out. Try again.' : "Couldn't reach the server. Check your connection and try again."),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (r.headers.get('x-sw-cache')) showOffline();
    var data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) {
      throw {
        code: (data && data.error) || 'http_' + r.status,
        message: (data && data.message) || 'Something went wrong (' + r.status + '). Try again.',
        fields: data && data.fields,
        status: r.status,
      };
    }
    return data;
  }

  // Render an error: setup problems get a clear "setup needed" box with the fix.
  function errorHtml(err) {
    var e = err || {};
    if (SETUP[e.code]) {
      return '<div class="notice setup" role="alert"><b>Setup needed</b>' + esc(e.message) +
        '<div class="small muted" style="margin-top:6px">See README → Setup, or open <a href="/api/health">/api/health</a> for a checklist.</div></div>';
    }
    return '<div class="notice error" role="alert">' + esc(e.message || 'Something went wrong.') + '</div>';
  }

  function showOffline() {
    if ($('#offline')) return;
    var d = document.createElement('div');
    d.id = 'offline';
    d.className = 'offline';
    d.textContent = "You're offline — showing the last saved copy.";
    var main = $('main');
    if (main) main.insertBefore(d, main.firstChild);
  }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function header(active) {
    var h = document.createElement('header');
    h.className = 'top';
    var link = function (href, key, label) { return '<a href="' + href + '"' + (active === key ? ' class="on" aria-current="page"' : '') + '>' + label + '</a>'; };
    h.innerHTML = '<div class="bar"><a class="brand" href="/">NRSC Worship</a><nav class="tabs">' +
      link('/', 'songs', 'Songs') + link('/sets.html', 'sets', 'Set lists') + link('/admin.html', 'admin', 'Admin') + '</nav></div>';
    document.body.insertBefore(h, document.body.firstChild);
  }

  // Show a saved copy straight away, then refresh from the network.
  async function cached(key, path, render, onError) {
    var saved = store.get(key, null);
    if (saved) render(saved, true);
    try {
      var fresh = await api(path);
      store.set(key, fresh);
      render(fresh, false);
    } catch (e) {
      if (!saved || SETUP[e.code]) onError(e, !!saved);
      else showOffline();
    }
  }

  function sessionBadge(s) {
    return s ? '<span class="badge ' + s + '">' + esc(W.SESSIONS[s] || s) + '</span>' : '';
  }

  function themeNames(ids, byId) {
    return (ids || []).map(function (id) { return byId[id]; }).filter(Boolean).map(function (t) { return t.name; });
  }

  // Admin PIN: this tab only, unless "remember on this phone" was ticked.
  var pin = {
    get: function () { return store.get('nw.pin', '', sessionStorage) || store.get('nw.pin', ''); },
    set: function (v, remember) {
      store.set('nw.pin', v, sessionStorage);
      store.set('nw.pin', remember ? v : null);
    },
    clear: function () { store.set('nw.pin', null, sessionStorage); store.set('nw.pin', null); },
  };

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }

  window.UI = { store: store, esc: esc, $: $, api: api, errorHtml: errorHtml, toast: toast, header: header, cached: cached,
    sessionBadge: sessionBadge, themeNames: themeNames, pin: pin, showOffline: showOffline, SETUP: SETUP };
})();
