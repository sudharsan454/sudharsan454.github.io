/* Review backend for the comment layer · v1.0 · 4 Oct 2026
   The comment layer (comments.js, pin-comments.js, all-comments.html) was written for facilio.run,
   which gives every site /api/me, /api/db and /ws. GitHub Pages has none of these, so this file
   provides the same three endpoints in the browser, backed by a Supabase table:
     /api/me            -> the reviewer's name, asked once and kept in this browser
     /api/db/<c>[/<k>]  -> rows in public.review_kv (collection, key, value)
     /ws                -> a light poll that tells the layer when someone else changed a page
   It only runs on the review link (?review). Normal visitors never load it. */
(function () {
  if (window.__reviewBackend) return;
  window.__reviewBackend = true;

  var SUPA = "https://bxzmneeacjjtwmtdsrjd.supabase.co";
  var KEY = "sb_publishable_dcwUfURxdPF8AquVEs7KzA_xpcJQR1b";
  var TABLE = SUPA + "/rest/v1/review_kv";
  var H = { apikey: KEY, Authorization: "Bearer " + KEY, "content-type": "application/json" };
  var realFetch = window.fetch.bind(window);

  function json(body, status) {
    return new Response(JSON.stringify(body), { status: status || 200, headers: { "content-type": "application/json" } });
  }
  function slug(s) { return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "guest"; }

  /* ---------- identity ---------- */
  var mePromise = null;
  function getName() {
    try { var n = localStorage.getItem("rv-name"); if (n) return Promise.resolve(n); } catch (_) {}
    return new Promise(function (resolve) {
      function ask() {
        var wrap = document.createElement("div");
        wrap.setAttribute("data-comments-ui", "1");
        wrap.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(15,29,26,.45);display:flex;align-items:center;justify-content:center;padding:16px;font:15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
        wrap.innerHTML = '<form style="background:#fff;color:#0f1d1a;border-radius:12px;padding:22px;max-width:360px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.25)">'
          + '<b style="font-size:17px">Review mode</b><p style="margin:6px 0 14px;color:#3a4844">Thanks for reviewing. What name should your comments show?</p>'
          + '<input name="n" required maxlength="40" placeholder="Your name" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #c9d1cd;border-radius:8px;font:inherit">'
          + '<button style="margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#e8590c;color:#fff;font:600 15px inherit;cursor:pointer">Start commenting</button></form>';
        document.body.appendChild(wrap);
        var f = wrap.querySelector("form"); f.n.focus();
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var n = f.n.value.trim().slice(0, 40); if (!n) return;
          try { localStorage.setItem("rv-name", n); } catch (_) {}
          wrap.remove(); resolve(n);
        });
      }
      if (document.body) ask(); else document.addEventListener("DOMContentLoaded", ask);
    });
  }
  function me() {
    if (!mePromise) mePromise = getName().then(function (n) {
      /* the layer derives the display name from the part before "@" */
      return { email: slug(n).replace(/\./g, "_") + "@review", name: n, site: "portfolio" };
    });
    return mePromise;
  }

  /* ---------- KV over Supabase REST ---------- */
  function q(s) { return encodeURIComponent(s); }
  function dbGet(c, k) {
    return realFetch(TABLE + "?select=value&collection=eq." + q(c) + "&key=eq." + q(k), { headers: H })
      .then(function (r) { return r.json(); })
      .then(function (rows) { return Array.isArray(rows) && rows.length ? json({ key: k, value: rows[0].value }) : json({ error: "not found" }, 404); });
  }
  function dbList(c) {
    return realFetch(TABLE + "?select=key,value&collection=eq." + q(c), { headers: H })
      .then(function (r) { return r.json(); })
      .then(function (rows) { return json({ items: Array.isArray(rows) ? rows : [] }); });
  }
  function dbPut(c, k, body) {
    var v = {}; try { v = JSON.parse(body || "{}").value; } catch (_) {}
    return realFetch(TABLE + "?on_conflict=collection,key", {
      method: "POST",
      headers: Object.assign({ Prefer: "resolution=merge-duplicates,return=minimal" }, H),
      body: JSON.stringify({ collection: c, key: k, value: v, updated_at: new Date().toISOString() })
    }).then(function (r) { if (r.ok) poke(); return json({ ok: r.ok }, r.ok ? 200 : r.status); });
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var path; try { path = new URL(url, location.href).pathname; } catch (_) { path = url; }
    var method = ((init && init.method) || "GET").toUpperCase();
    if (path === "/api/me") return me().then(function (m) { return json(m); });
    if (path === "/roster.json") return Promise.resolve(json([]));
    var m = path.match(/^\/api\/db\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      var c = decodeURIComponent(m[1]), k = m[2] ? decodeURIComponent(m[2]) : null;
      if (!k) return dbList(c);
      if (method === "PUT") return dbPut(c, k, init && init.body);
      return dbGet(c, k);
    }
    return realFetch(input, init);
  };

  /* ---------- "/ws": poll for changes made by other reviewers ---------- */
  var sockets = [], seen = {}, primed = false;
  function poll() {
    return realFetch(TABLE + "?select=key,updated_at&collection=eq.comments", { headers: H })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
          var changed = seen[row.key] && seen[row.key] !== row.updated_at;
          seen[row.key] = row.updated_at;
          if (changed && primed) emit(row.key);
        });
        primed = true;
      }).catch(function () {});
  }
  function poke() { setTimeout(poll, 400); }
  function emit(key) {
    var page = String(key).replace(/^page:/, "").replace(/__/g, "/");
    var msg = { data: JSON.stringify({ data: { kind: "comment", page: page } }) };
    sockets.forEach(function (s) { try { s.onmessage && s.onmessage(msg); } catch (_) {} });
  }
  var RealWS = window.WebSocket;
  window.WebSocket = function (url, p) {
    if (!/\/ws$/.test(String(url))) return new RealWS(url, p);
    var s = { readyState: 1, send: function () {}, close: function () { this.readyState = 3; }, onmessage: null };
    sockets.push(s);
    return s;
  };
  window.WebSocket.OPEN = 1;
  poll();
  setInterval(function () { if (!document.hidden) poll(); }, 12000);
})();
