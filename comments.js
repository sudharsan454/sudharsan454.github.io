/* Facilio Run comment layer — REVIEW PANEL. v2.1 · 9-Oct-2026 (portfolio: hub link carries ?review) · based on v2 29-Jul-2026
   Drop-in:  <script src="comments.js" data-page="THIS_FILENAME.html"></script>

   Floating bottom-right panel. Two tabs (Comments / Add). Threads with replies,
   resolve/reopen, Open|Resolved|All filter, This-page|All-pages scope, and — in
   All-pages mode — a page picker so you can read one page at a time or everything
   at once, and still reply/resolve without leaving the page you're on.

   Identity: /api/me · Storage: /api/db (KV, one record per page) · Live: /ws

   Every mutation is read-modify-write against the target page's record. That
   matters because pin-comments.js writes to the SAME record: a blind whole-state
   PUT would silently erase a pin someone dropped ten seconds ago.

   roster.json (optional, same folder) seeds @mention autocomplete with people who
   haven't commented yet: [{"name":"Asha K","email":"asha@x.com"}, ...] */
(function () {
  "use strict";

  var PAGE = (document.currentScript && document.currentScript.getAttribute("data-page"))
    || location.pathname.split("/").pop() || "index.html";
  var COLLECTION = "comments";
  var NOTIFY_COLLECTION = "mention_queue";
  var me = { email: "", name: "you" };
  var state = { threads: [] };
  var roster = [];
  var knownPages = [];
  var ws = null;
  var filterMine = false;
  var activeTab = "comments";
  var statusFilter = "open";
  var scopeAll = false;
  var pageFilter = "__all__";

  /* The KV store rejects "/" in keys (400 Invalid key), even percent-encoded, so a
     page in a subfolder has to be flattened. "__" round-trips cleanly — just don't
     put a literal "__" in a filename. */
  function keyFor(pg) { return "page:" + String(pg).replace(/\//g, "__"); }
  function pageFromKey(k) { return String(k || "").replace(/^page:/, "").replace(/__/g, "/"); }
  function deriveName(email) {
    if (!email) return "Someone";
    var local = String(email).split("@")[0];
    var first = local.split(/[._-]/)[0] || local;
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
  function el(t, css, html) { var d = document.createElement(t); if (css) d.style.cssText = css; if (html != null) d.innerHTML = html; return d; }
  function fmtTime(iso) { try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (_) { return ""; } }
  function uid(p) { return (p || "x") + Date.now() + Math.random().toString(36).slice(2, 6); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ---------- sections ---------- */
  function detectSections() {
    var out = [{ id: "general", label: "General (whole page)" }];
    var seen = {}, nodes = document.querySelectorAll("h1, h2, .h1, .path .h, .section, .step, .fl");
    Array.prototype.forEach.call(nodes, function (n, i) {
      var label = (n.textContent || "").trim().replace(/\s+/g, " ");
      if (!label || label.length > 70 || seen[label]) return;
      seen[label] = true;
      out.push({ id: "sec-" + i, label: label });
    });
    return out;
  }

  /* ---------- storage ---------- */
  function migrateToThreads(v) {
    var val = (v && v.value !== undefined) ? v.value : v;
    if (!val) return [];
    if (Array.isArray(val.threads)) return val.threads;
    if (Array.isArray(val)) {
      return val.map(function (c) {
        return { id: c.id || uid("t"), section: c.section || "general",
          sectionLabel: c.sectionLabel || "General", resolved: !!c.resolved,
          items: [{ id: c.id || uid("c"), email: c.email, name: c.name,
            text: c.text, at: c.at || new Date().toISOString(), mentions: c.mentions || [] }] };
      });
    }
    if (val.items && Array.isArray(val.items)) return migrateToThreads(val.items);
    return [];
  }
  function loadPage(pg) {
    return fetch("/api/db/" + COLLECTION + "/" + encodeURIComponent(keyFor(pg)))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        var ts = migrateToThreads(v);
        ts.forEach(function (t) { t._page = pg; });
        return ts;
      })
      .catch(function () { return []; });
  }
  function loadAllPages() {
    return fetch("/api/db/" + COLLECTION)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var items = (data && data.items) ? data.items : [];
        var all = [], pages = [];
        items.forEach(function (it) {
          var pg = pageFromKey(it.key);
          if (!pg) return;
          var ts = migrateToThreads(it.value);
          if (!ts.length) return;
          pages.push(pg);
          ts.forEach(function (t) { t._page = pg; all.push(t); });
        });
        if (pages.indexOf(PAGE) === -1) pages.push(PAGE);
        knownPages = pages.sort();
        state = { threads: all };
        syncPagePicker();
      })
      .catch(function () { state = { threads: [] }; });
  }
  function load() {
    if (scopeAll) return loadAllPages();
    return loadPage(PAGE).then(function (ts) { state = { threads: ts }; });
  }

  /* Threads that came from legacy flat records get fresh ids on every read, so id
     matching alone can miss. Fall back to the identity of the opening comment. */
  function sameThread(a, b) {
    if (a && b && a.id && b.id && a.id === b.id) return true;
    var ai = (a && a.items || [])[0], bi = (b && b.items || [])[0];
    return !!ai && !!bi && ai.at === bi.at && ai.email === bi.email && ai.text === bi.text;
  }
  /* fn(freshThreadsArray) mutates in place. Always re-reads first. */
  function mutatePage(pg, fn) {
    var k = keyFor(pg);
    return fetch("/api/db/" + COLLECTION + "/" + encodeURIComponent(k))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        var arr = migrateToThreads(v);
        fn(arr);
        return fetch("/api/db/" + COLLECTION + "/" + encodeURIComponent(k), {
          method: "PUT", headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: { threads: arr } })
        });
      })
      .then(function () {
        broadcast(pg);
        try { window.dispatchEvent(new CustomEvent("cw-saved")); } catch (_) {}
        return load().then(render);
      })
      .catch(function () { return load().then(render); });
  }
  function withThread(t, apply) {
    return mutatePage(t._page || PAGE, function (arr) {
      for (var i = 0; i < arr.length; i++) {
        if (sameThread(arr[i], t)) { apply(arr[i], arr, i); return; }
      }
    });
  }
  function queueMentions(mentions, ctx) {
    if (!mentions.length) return;
    var key = "m:" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    fetch("/api/db/" + NOTIFY_COLLECTION + "/" + encodeURIComponent(key), {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: {
        page: PAGE, url: location.href, mentions: mentions, by: me.email,
        byName: me.name, text: ctx, at: new Date().toISOString(), sent: false
      } })
    }).catch(function () {});
  }

  /* ---------- mentions ---------- */
  function loadRoster() {
    return fetch("/roster.json").then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) { roster = Array.isArray(list) ? list : []; })
      .catch(function () { roster = []; });
  }
  function liveRoster() {
    var seen = {}, out = [];
    state.threads.forEach(function (t) {
      (t.items || []).forEach(function (it) {
        if (it.email && !seen[it.email]) { seen[it.email] = 1; out.push({ name: it.name || deriveName(it.email), email: it.email }); }
      });
    });
    return out;
  }
  function mergedRoster() {
    var map = {};
    liveRoster().concat(roster).forEach(function (p) { if (p.email && !map[p.email]) map[p.email] = p; });
    if (me.email && !map[me.email]) map[me.email] = { name: me.name, email: me.email };
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function parseMentions(text) {
    var hits = [];
    mergedRoster().forEach(function (p) {
      var handle = "@" + (p.name || "").replace(/\s+/g, "");
      var first = "@" + deriveName(p.email);
      if (text.indexOf(handle) !== -1 || text.indexOf(first) !== -1) hits.push(p.email);
    });
    return hits.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  function highlightMentions(text) {
    return esc(text).replace(/@([A-Za-z][A-Za-z0-9._ ]{0,28})/g, function (m) {
      return '<span style="color:#1864E6;font-weight:700;background:#eef4ff;border-radius:4px;padding:0 3px;">' + m.trim() + '</span>';
    });
  }

  /* ---------- live ---------- */
  function connectWS() {
    try {
      ws = new WebSocket("wss://" + location.host + "/ws");
      ws.onmessage = function (e) {
        try {
          var env = JSON.parse(e.data);
          if (env && env.data && env.data.kind === "comment" && (scopeAll || env.data.page === PAGE)) load().then(render);
        } catch (_) {}
      };
    } catch (_) {}
  }
  function broadcast(pg) {
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ kind: "comment", page: pg || PAGE })); } catch (_) {}
  }

  var panel, streamEl, sectionSel, countBadge, launcher, composerTA, acBox, mineBtn;
  var tabCommentsBtn, tabAddBtn, commentsView, addView, segWrap, picker2;
  var pageSel, pageWrap, sectionWrap;

  /* ---------- render ---------- */
  function syncPagePicker() {
    if (!pageSel) return;
    var prev = pageSel.value;
    pageSel.innerHTML = "";
    var all = document.createElement("option");
    all.value = "__all__"; all.textContent = "★ All pages (" + knownPages.length + ")";
    pageSel.appendChild(all);
    knownPages.forEach(function (pg) {
      var o = document.createElement("option");
      o.value = pg;
      o.textContent = (pg === PAGE ? "• " : "") + pg;
      pageSel.appendChild(o);
    });
    pageSel.value = (prev && (prev === "__all__" || knownPages.indexOf(prev) !== -1)) ? prev : "__all__";
    pageFilter = pageSel.value;
  }

  function render() {
    if (!streamEl) return;
    updateTabs();
    if (pageWrap) pageWrap.style.display = scopeAll ? "block" : "none";
    if (sectionWrap) sectionWrap.style.display = scopeAll ? "none" : "block";

    var sel = sectionSel ? sectionSel.value : "general";
    var allSections = (sel === "__all__");
    var threads = state.threads.filter(function (t) {
      if (scopeAll) return pageFilter === "__all__" || t._page === pageFilter;
      return allSections || t.section === sel;
    });
    if (statusFilter === "open") threads = threads.filter(function (t) { return !t.resolved; });
    else if (statusFilter === "resolved") threads = threads.filter(function (t) { return t.resolved; });
    if (filterMine) {
      threads = threads.filter(function (t) {
        return (t.items || []).some(function (it) { return (it.mentions || []).indexOf(me.email) !== -1; });
      });
    }
    var total = state.threads.reduce(function (n, t) { return n + (t.items ? t.items.length : 0); }, 0);
    if (countBadge) {
      countBadge.textContent = total ? String(total) : "";
      countBadge.style.display = total ? "inline-block" : "none";
    }

    if (!threads.length) {
      var msg = filterMine ? "Nothing mentions you here."
        : statusFilter === "resolved" ? "No resolved threads here."
        : statusFilter === "open" ? "No open threads here. Switch to the Add tab to start one — or press C and click anywhere on the page to pin one."
        : "No comments here yet.";
      streamEl.innerHTML = '<div style="color:#9aa0aa;font-size:13px;padding:30px 6px;text-align:center;line-height:1.6;">' + msg + '</div>';
      return;
    }
    streamEl.innerHTML = "";
    function firstAt(t) { return (t.items && t.items[0] && t.items[0].at) ? new Date(t.items[0].at).getTime() : 0; }
    threads.sort(function (a, b) { return firstAt(b) - firstAt(a); });

    threads.forEach(function (t) {
      if (!t.items || !t.items.length) return;
      var onThisPage = (t._page || PAGE) === PAGE;
      var card = el("div", "border:1px solid " + (t.resolved ? "#dfe9df" : "#ececec") + ";border-radius:12px;margin-bottom:11px;overflow:hidden;background:" + (t.resolved ? "#f5faf5" : "#fff") + ";");

      var bar = el("div", "display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 10px 7px 12px;border-bottom:1px solid #f3f2ee;background:" + (t.resolved ? "#eaf6ee" : "#fafafa") + ";");
      var lbl = t.resolved ? "✓ RESOLVED"
        : (t.anchor ? "📍 PIN" : (scopeAll ? "THREAD" : ((sel === "__all__" && t.sectionLabel) ? t.sectionLabel.toUpperCase() : "THREAD")));
      bar.appendChild(el("span", "font-size:11px;font-weight:700;letter-spacing:.04em;color:" + (t.resolved ? "#15803D" : "#9aa0aa") + ";overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", lbl));

      var actions = el("div", "display:flex;gap:6px;align-items:center;flex-shrink:0;");
      if (scopeAll && !onThisPage) {
        var openLink = el("a", "font:600 11px -apple-system,sans-serif;color:#1864E6;text-decoration:none;white-space:nowrap;");
        openLink.href = "/" + t._page; openLink.target = "_blank"; openLink.rel = "noopener";
        openLink.textContent = t._page.replace(/\.html$/, "") + " ↗";
        actions.appendChild(openLink);
      }
      if (onThisPage && t.anchor && window.__pinComments && window.__pinComments.isOnCurrentView
          && !window.__pinComments.isOnCurrentView(t)) {
        var offView = el("span", "font:600 10px/1 -apple-system,sans-serif;letter-spacing:.04em;text-transform:uppercase;border:1px solid #d6dae0;background:#f4f5f7;border-radius:6px;padding:4px 7px;color:#6b7280;white-space:nowrap;", "OTHER VIEW");
        offView.title = "Pinned on a part of this page that isn't currently open. Jump will switch to it.";
        actions.appendChild(offView);
      }
      if (onThisPage && t.anchor && window.__pinComments && window.__pinComments.jump) {
        var jump = el("button", "font:600 11px -apple-system,sans-serif;cursor:pointer;border:1px solid #f0d3a8;background:#fffaf2;border-radius:7px;padding:4px 8px;color:#B45309;white-space:nowrap;", "Jump ↧");
        jump.addEventListener("click", function () { window.__pinComments.jump(t); });
        actions.appendChild(jump);
      }
      var rbtn = el("button", "font:600 11px -apple-system,sans-serif;cursor:pointer;border:1px solid #d6dae0;background:#fff;border-radius:7px;padding:4px 9px;color:#33373f;white-space:nowrap;", t.resolved ? "Reopen" : "Resolve");
      rbtn.addEventListener("click", function () {
        rbtn.disabled = true;
        withThread(t, function (th) { th.resolved = !t.resolved; });
      });
      actions.appendChild(rbtn);
      bar.appendChild(actions);
      card.appendChild(bar);

      (t.items || []).forEach(function (it, idx) {
        var wrap = el("div", "padding:10px 12px;" + (idx ? "border-top:1px dashed #f0efea;" : ""));
        var head = el("div", "display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:3px;");
        var who = el("span", "font-weight:700;font-size:13px;color:#1a1d24;");
        who.textContent = it.name || deriveName(it.email); who.title = it.email || "";
        head.appendChild(who);
        var meta = el("span", "display:flex;align-items:center;gap:6px;white-space:nowrap;");
        meta.appendChild(el("span", "font-size:11px;color:#9aa0aa;", fmtTime(it.at)));
        if (it.email && me.email && it.email === me.email) {
          var delBtn = el("button", "border:none;background:none;cursor:pointer;font-size:12px;color:#c2410c;padding:0 2px;line-height:1;", "🗑");
          delBtn.title = "Delete my comment";
          (function (item) {
            delBtn.addEventListener("click", function () {
              if (delBtn.getAttribute("data-arm") !== "1") {
                delBtn.setAttribute("data-arm", "1"); delBtn.textContent = "Sure?";
                delBtn.style.cssText += "font:700 11px -apple-system,sans-serif;color:#fff;background:#DC2626;border-radius:6px;padding:2px 6px;";
                setTimeout(function () {
                  delBtn.setAttribute("data-arm", "0"); delBtn.innerHTML = "🗑";
                  delBtn.style.cssText = "border:none;background:none;cursor:pointer;font-size:12px;color:#c2410c;padding:0 2px;line-height:1;";
                }, 2600);
                return;
              }
              withThread(t, function (th, arr, i) {
                th.items = (th.items || []).filter(function (x) {
                  return !(x.at === item.at && x.email === item.email && x.text === item.text);
                });
                if (!th.items.length) arr.splice(i, 1);
              });
            });
          })(it);
          meta.appendChild(delBtn);
        }
        head.appendChild(meta);
        wrap.appendChild(head);
        wrap.appendChild(el("div", "font-size:13.5px;line-height:1.5;color:#33373f;white-space:pre-wrap;", highlightMentions(it.text || "")));
        card.appendChild(wrap);
      });

      var reply = el("div", "padding:8px 12px 11px;");
      var rta = el("textarea", "width:100%;box-sizing:border-box;font:inherit;font-size:13px;color:#1a1d24;background:#fbfbf9;border:1.5px solid #e7e6e1;border-radius:9px;padding:8px;resize:vertical;min-height:36px;");
      rta.placeholder = onThisPage ? "Reply…  (type @ to mention)" : "Reply on " + t._page + "…";
      attachAutocomplete(rta);
      var rsend = el("button", "margin-top:7px;font:600 12.5px -apple-system,sans-serif;color:#fff;background:#1864E6;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;", "Reply");
      function doReply() {
        var v = rta.value.trim(); if (!v) return;
        var mentions = parseMentions(v);
        rsend.disabled = true; rsend.textContent = "Posting…";
        withThread(t, function (th) {
          th.items = th.items || [];
          th.items.push({ id: uid("c"), email: me.email, name: me.name, text: v, at: new Date().toISOString(), mentions: mentions });
          if (th.resolved) th.resolved = false;
        }).then(function () { queueMentions(mentions, v); });
      }
      rsend.addEventListener("click", doReply);
      rta.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") doReply(); });
      reply.appendChild(rta); reply.appendChild(rsend);
      card.appendChild(reply);

      streamEl.appendChild(card);
    });
  }

  function newThread(text) {
    var src = (picker2 && picker2.value) ? picker2 : sectionSel;
    var selv = src ? src.value : "general";
    if (selv === "__all__") selv = "general";
    var label = "General";
    if (src) { for (var i = 0; i < src.options.length; i++) { if (src.options[i].value === selv) { label = src.options[i].text; break; } } }
    var mentions = parseMentions(text);
    activeTab = "comments"; statusFilter = "open"; setSeg();
    if (sectionSel) sectionSel.value = "__all__";
    mutatePage(PAGE, function (arr) {
      arr.push({ id: uid("t"), section: selv, sectionLabel: label, resolved: false,
        items: [{ id: uid("c"), email: me.email, name: me.name, text: text, at: new Date().toISOString(), mentions: mentions }] });
    }).then(function () { queueMentions(mentions, text); });
  }

  /* ---------- @mention autocomplete ---------- */
  function attachAutocomplete(ta) {
    ta.addEventListener("input", function () {
      var v = ta.value, pos = ta.selectionStart, upto = v.slice(0, pos);
      var m = upto.match(/@([A-Za-z0-9._ ]{0,28})$/);
      if (!m) { hideAC(); return; }
      var q = m[1].toLowerCase().trim();
      var matches = mergedRoster().filter(function (p) {
        return (p.name || "").toLowerCase().indexOf(q) !== -1 || (p.email || "").toLowerCase().indexOf(q) !== -1;
      }).slice(0, 6);
      if (!matches.length) { hideAC(); return; }
      showAC(ta, matches, m.index, pos);
    });
    ta.addEventListener("blur", function () { setTimeout(hideAC, 150); });
  }
  function hideAC() { if (acBox) acBox.style.display = "none"; }
  function showAC(ta, matches, atIdx, caret) {
    if (!acBox) {
      acBox = el("div", "position:fixed;z-index:100000;background:#fff;border:1px solid #e1e0db;border-radius:10px;box-shadow:0 10px 30px rgba(20,30,50,.16);overflow:hidden;min-width:200px;");
      acBox.setAttribute("data-comments-ui", "1");
      document.body.appendChild(acBox);
    }
    acBox.innerHTML = "";
    matches.forEach(function (p) {
      var row = el("div", "padding:8px 11px;cursor:pointer;font-size:13px;display:flex;flex-direction:column;gap:1px;");
      row.onmouseenter = function () { row.style.background = "#f0f6ff"; };
      row.onmouseleave = function () { row.style.background = "#fff"; };
      row.innerHTML = '<span style="font-weight:700;color:#1a1d24;">' + esc(p.name || deriveName(p.email)) + '</span><span style="font-size:11px;color:#9aa0aa;">' + esc(p.email) + '</span>';
      row.addEventListener("mousedown", function (e) {
        e.preventDefault();
        var v = ta.value, handle = "@" + (p.name || deriveName(p.email)).replace(/\s+/g, "") + " ";
        ta.value = v.slice(0, atIdx) + handle + v.slice(caret);
        hideAC(); ta.focus();
      });
      acBox.appendChild(row);
    });
    var r = ta.getBoundingClientRect();
    acBox.style.left = r.left + "px";
    acBox.style.top = (r.top - Math.min(matches.length * 44 + 8, 200)) + "px";
    acBox.style.display = "block";
  }

  /* ---------- chrome ---------- */
  function updateTabs() {
    if (!tabCommentsBtn) return;
    var base = "flex:1;font:700 13px -apple-system,sans-serif;cursor:pointer;border:none;padding:12px 0 10px;background:#fff;";
    var on = "color:#1864E6;border-bottom:2px solid #1864E6;";
    var off = "color:#9aa0aa;border-bottom:2px solid transparent;";
    tabCommentsBtn.style.cssText = base + (activeTab === "comments" ? on : off);
    tabAddBtn.style.cssText = base + (activeTab === "add" ? on : off);
    commentsView.style.display = activeTab === "comments" ? "block" : "none";
    addView.style.display = activeTab === "add" ? "block" : "none";
  }
  function setSeg() {
    if (!segWrap) return;
    Array.prototype.forEach.call(segWrap.querySelectorAll("button"), function (b) {
      var active = b.getAttribute("data-v") === statusFilter;
      b.style.cssText = "flex:1;font:600 12px -apple-system,sans-serif;cursor:pointer;border:none;padding:7px 0;border-radius:7px;"
        + (active ? "background:#fff;color:#1a1d24;box-shadow:0 1px 2px rgba(0,0,0,.08);" : "background:transparent;color:#6b7077;");
    });
  }

  function build() {
    launcher = el("button", "position:fixed;right:20px;bottom:20px;z-index:99998;display:flex;align-items:center;gap:8px;font:600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#fff;background:#1864E6;border:none;border-radius:100px;padding:13px 18px;cursor:pointer;box-shadow:0 6px 20px rgba(24,100,230,.32);");
    launcher.setAttribute("data-comments-ui", "1");
    launcher.innerHTML = '💬 Comments <span id="cw-count" style="display:none;min-width:18px;height:18px;line-height:18px;text-align:center;font-size:11px;background:#fff;color:#1864E6;border-radius:100px;padding:0 5px;font-weight:800;"></span>';

    panel = el("div", "position:fixed;right:20px;bottom:74px;z-index:99999;width:368px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #e7e6e1;border-radius:16px;display:none;box-shadow:0 16px 48px rgba(20,30,50,.18);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;");

    panel.setAttribute("data-comments-ui", "1");

    var header = el("div", "padding:14px 16px 0;");
    var titlerow = el("div", "display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;gap:8px;");
    titlerow.appendChild(el("div", "font-weight:800;font-size:15px;color:#1a1d24;", "Review"));
    var idline = el("div", "font-size:11.5px;color:#9aa0aa;text-align:right;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;");
    idline.id = "cw-id"; idline.textContent = "Identifying you…";
    titlerow.appendChild(idline);
    header.appendChild(titlerow);
    var allLink = el("a", "display:block;font-size:11.5px;color:#1864E6;text-decoration:none;font-weight:600;padding:0 0 8px;");
    allLink.href = "/all-comments.html?review"; allLink.textContent = "↗ Open the full comment hub";
    header.appendChild(allLink);

    var tabs = el("div", "display:flex;border-bottom:1px solid #f0efea;");
    tabCommentsBtn = el("button", "", "Comments");
    tabAddBtn = el("button", "", "＋ Add comment");
    tabCommentsBtn.addEventListener("click", function () { activeTab = "comments"; render(); });
    tabAddBtn.addEventListener("click", function () { activeTab = "add"; updateTabs(); setTimeout(function () { composerTA && composerTA.focus(); }, 30); });
    tabs.appendChild(tabCommentsBtn); tabs.appendChild(tabAddBtn);
    header.appendChild(tabs);
    panel.appendChild(header);

    function makeSectionPicker(labelText) {
      var p = el("div", "padding:12px 16px 4px;");
      p.appendChild(el("label", "display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9aa0aa;margin-bottom:6px;font-weight:700;", labelText));
      var sel = el("select", "width:100%;font:inherit;font-size:13.5px;color:#1a1d24;background:#fbfbf9;border:1.5px solid #e7e6e1;border-radius:10px;padding:9px 10px;cursor:pointer;");
      detectSections().forEach(function (s) {
        var o = document.createElement("option"); o.value = s.id; o.textContent = s.label; sel.appendChild(o);
      });
      p.appendChild(sel);
      return { wrap: p, sel: sel };
    }

    commentsView = el("div", "");

    /* scope: this page vs every page in the site */
    var scopeRow = el("div", "padding:12px 16px 0;");
    var scopeSeg = el("div", "display:flex;gap:3px;background:#f0efea;border-radius:9px;padding:3px;");
    function paintScope() {
      Array.prototype.forEach.call(scopeSeg.querySelectorAll("button"), function (x) {
        var on = x.getAttribute("data-scope") === (scopeAll ? "all" : "page");
        x.style.background = on ? "#fff" : "transparent";
        x.style.color = on ? "#1a1d24" : "#6b7077";
        x.style.boxShadow = on ? "0 1px 2px rgba(0,0,0,.08)" : "none";
      });
    }
    [["page", "This page"], ["all", "All pages"]].forEach(function (pair) {
      var b = el("button", "flex:1;font:600 12px -apple-system,sans-serif;cursor:pointer;border:none;padding:7px 0;border-radius:7px;", pair[1]);
      b.setAttribute("data-scope", pair[0]);
      b.addEventListener("click", function () {
        scopeAll = (pair[0] === "all");
        paintScope();
        load().then(render);
      });
      scopeSeg.appendChild(b);
    });
    scopeRow.appendChild(scopeSeg);
    commentsView.appendChild(scopeRow);

    /* page picker — only meaningful in All-pages mode */
    pageWrap = el("div", "padding:12px 16px 4px;display:none;");
    pageWrap.appendChild(el("label", "display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9aa0aa;margin-bottom:6px;font-weight:700;", "Page"));
    pageSel = el("select", "width:100%;font:inherit;font-size:13.5px;color:#1a1d24;background:#fbfbf9;border:1.5px solid #e7e6e1;border-radius:10px;padding:9px 10px;cursor:pointer;");
    pageSel.addEventListener("change", function () { pageFilter = pageSel.value; render(); });
    pageWrap.appendChild(pageSel);
    commentsView.appendChild(pageWrap);

    var pk = makeSectionPicker("Section");
    sectionWrap = pk.wrap; sectionSel = pk.sel;
    var allOpt = document.createElement("option");
    allOpt.value = "__all__"; allOpt.textContent = "★ All sections on this page";
    sectionSel.insertBefore(allOpt, sectionSel.firstChild);
    sectionSel.value = "__all__";
    sectionSel.addEventListener("change", render);
    commentsView.appendChild(sectionWrap);

    var ctrlRow = el("div", "padding:8px 16px 4px;display:flex;gap:8px;align-items:center;");
    segWrap = el("div", "flex:1;display:flex;gap:3px;background:#f0efea;border-radius:9px;padding:3px;");
    [["open", "Open"], ["resolved", "Resolved"], ["all", "All"]].forEach(function (pair) {
      var b = el("button", "", pair[1]); b.setAttribute("data-v", pair[0]);
      b.addEventListener("click", function () { statusFilter = pair[0]; setSeg(); render(); });
      segWrap.appendChild(b);
    });
    ctrlRow.appendChild(segWrap);
    mineBtn = el("button", "font:600 11px -apple-system,sans-serif;cursor:pointer;border:1px solid #d6dae0;background:#fff;border-radius:8px;padding:7px 10px;color:#33373f;white-space:nowrap;", "@ me");
    mineBtn.addEventListener("click", function () {
      filterMine = !filterMine;
      mineBtn.style.background = filterMine ? "#1864E6" : "#fff";
      mineBtn.style.color = filterMine ? "#fff" : "#33373f";
      mineBtn.style.borderColor = filterMine ? "#1864E6" : "#d6dae0";
      render();
    });
    ctrlRow.appendChild(mineBtn);
    commentsView.appendChild(ctrlRow);

    streamEl = el("div", "padding:10px 16px 16px;max-height:340px;overflow-y:auto;");
    commentsView.appendChild(streamEl);
    panel.appendChild(commentsView);

    addView = el("div", "display:none;");
    var pk2 = makeSectionPicker("Section");
    picker2 = pk2.sel;
    addView.appendChild(pk2.wrap);
    var composer = el("div", "padding:8px 16px 16px;");
    composer.appendChild(el("div", "font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9aa0aa;margin-bottom:6px;font-weight:700;", "New comment"));
    composerTA = el("textarea", "width:100%;box-sizing:border-box;font:inherit;font-size:13.5px;color:#1a1d24;background:#fbfbf9;border:1.5px solid #e7e6e1;border-radius:10px;padding:10px;resize:vertical;min-height:90px;");
    composerTA.placeholder = "Comment on this section…  type @ to mention someone";
    attachAutocomplete(composerTA);
    var send = el("button", "margin-top:9px;width:100%;font:600 14px -apple-system,sans-serif;color:#fff;background:#1864E6;border:none;border-radius:10px;padding:12px;cursor:pointer;", "Post comment");
    send.addEventListener("click", function () { var v = composerTA.value.trim(); if (!v) return; newThread(v); composerTA.value = ""; });
    composerTA.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send.click(); });
    composer.appendChild(composerTA); composer.appendChild(send);
    composer.appendChild(el("div", "font-size:11.5px;color:#9aa0aa;margin-top:8px;text-align:center;line-height:1.5;", "⌘/Ctrl + Enter to post · or press <b>C</b> and click anywhere to pin a comment to that exact spot"));
    addView.appendChild(composer);
    panel.appendChild(addView);

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    countBadge = document.getElementById("cw-count");
    paintScope(); setSeg(); updateTabs();

    launcher.addEventListener("click", function () {
      var opening = panel.style.display === "none";
      panel.style.display = opening ? "block" : "none";
      if (opening) { activeTab = "comments"; if (sectionSel) sectionSel.value = "__all__"; load().then(render); }
    });
  }

  function boot() {
    build();
    Promise.all([
      fetch("/api/me").then(function (r) { return r.ok ? r.json() : {}; }).then(function (m) {
        me.email = (m && m.email) || ""; me.name = deriveName(me.email);
        var idl = document.getElementById("cw-id");
        if (idl) idl.textContent = me.email ? ("Commenting as " + me.name + " · " + me.email) : "Signed in";
      }).catch(function () {}),
      loadRoster(),
      load()
    ]).then(render);
    connectWS();
    /* pin-comments.js fires cw-reload after it writes; keep both views in sync */
    window.addEventListener("cw-reload", function () { load().then(render); });
    window.addEventListener("cw-open-panel", function () {
      if (panel && panel.style.display === "none") launcher.click();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
