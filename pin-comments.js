/* Facilio Run comment layer — ANCHORED PINS. v2 · 29-Jul-2026
   Drop-in:  <script src="pin-comments.js" data-page="THIS_FILENAME.html"></script>

   Adobe-Acrobat-style pins. "Add comment" button (top-right), or press C, or
   Cmd/Ctrl+Shift+C → crosshair mode. Click ANY element — a paragraph, a table
   cell, an image, a chart — and the composer opens right there. The pin is stored
   as a normal thread in the SAME record comments.js uses, with an extra `anchor`
   field, so pinned comments also appear in the Review panel and the comment hub.

   Anchoring strategy: a structural CSS path to the clicked element plus the
   fractional offset inside its box, so the pin survives reflow at other window
   widths. Absolute page coordinates are kept as a last-resort fallback for when
   the element genuinely no longer exists (content was edited and redeployed).

   Every write re-reads the record first — comments.js writes to it too, and a
   blind overwrite would lose whatever the panel just saved. */
(function () {
  "use strict";

  var PAGE = (document.currentScript && document.currentScript.getAttribute("data-page"))
    || location.pathname.split("/").pop() || "index.html";
  var COLLECTION = "comments";
  /* The KV store rejects "/" in keys (400 Invalid key), even percent-encoded, so a
     page in a subfolder is flattened with "__" — same transform comments.js uses,
     which is what keeps both writing to one record. */
  var KEY = "page:" + PAGE.replace(/\//g, "__");
  var me = { email: "", name: "you" };
  var threads = [];
  var mode = false;
  var ws = null;
  var overlay, toolbar, popover;

  function deriveName(email) {
    if (!email) return "Someone";
    var local = String(email).split("@")[0];
    var first = local.split(/[._-]/)[0] || local;
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
  function uid(p) { return (p || "x") + Date.now() + Math.random().toString(36).slice(2, 6); }
  function fmtTime(iso) { try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (_) { return ""; } }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function el(t, css, html) { var d = document.createElement(t); if (css) d.style.cssText = css; if (html != null) d.innerHTML = html; return d; }

  function migrate(v) {
    var val = (v && v.value !== undefined) ? v.value : v;
    if (!val) return [];
    if (Array.isArray(val.threads)) return val.threads;
    return [];
  }
  function loadThreads() {
    return fetch("/api/db/" + COLLECTION + "/" + encodeURIComponent(KEY))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) { threads = migrate(v); })
      .catch(function () { threads = []; });
  }
  function mutate(fn) {
    return loadThreads().then(function () {
      fn(threads);
      return fetch("/api/db/" + COLLECTION + "/" + encodeURIComponent(KEY), {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: { threads: threads } })
      });
    }).then(function () {
      try { window.dispatchEvent(new CustomEvent("cw-reload")); } catch (_) {}
      try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ kind: "comment", page: PAGE })); } catch (_) {}
      renderPins();
    });
  }

  /* ---------- anchoring ---------- */
  function cssPath(node) {
    var parts = [];
    while (node && node.nodeType === 1 && node !== document.body) {
      var tag = node.tagName.toLowerCase(), i = 1, sib = node;
      while ((sib = sib.previousElementSibling)) { if (sib.tagName === node.tagName) i++; }
      parts.unshift(tag + ":nth-of-type(" + i + ")");
      node = node.parentElement;
    }
    return parts.length ? "body > " + parts.join(" > ") : "body";
  }
  function resolveEl(sel) { try { return document.querySelector(sel); } catch (_) { return null; } }

  /* Is this element actually laid out right now?
     Single-page documents (tabbed dossiers, accordions, routed apps) keep every
     view in ONE html file and toggle them with display/visibility/hidden. An
     anchor inside a view that is currently off-screen still RESOLVES, so we must
     ask whether it is visible, not merely whether it exists. Walking ancestors is
     the only reliable test: getBoundingClientRect() reports 0x0 for a hidden
     element, which is indistinguishable from a legitimately empty wrapper. */
  function isRenderable(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.isConnected === false) return false;
    var n = node;
    while (n && n.nodeType === 1) {
      if (n.hasAttribute && n.hasAttribute("hidden")) return false;
      var cs = null;
      try { cs = getComputedStyle(n); } catch (_) { return false; }
      if (!cs) return false;
      if (cs.display === "none") return false;
      if (cs.visibility === "hidden" || cs.visibility === "collapse") return false;
      if (cs.contentVisibility === "hidden") return false;
      n = n.parentElement;
    }
    return true;
  }

  /* The route a pin was dropped on. facilio.run serves static files with no
     rewrite rules, so single-page documents are almost always hash-routed —
     recording location.hash lets "Jump" reopen the right view later. */
  function viewKey() { return location.hash || ""; }

  /* Which container is hiding this anchor, and what do we call it?
     Pins created before routes were recorded have no way to reopen themselves, so
     the least we can do is name the view they live in. */
  function hidingAncestor(node) {
    var n = node;
    while (n && n.nodeType === 1) {
      var cs = null;
      try { cs = getComputedStyle(n); } catch (_) { return null; }
      if (!cs) return null;
      if ((n.hasAttribute && n.hasAttribute("hidden")) || cs.display === "none" ||
          cs.visibility === "hidden" || cs.visibility === "collapse") return n;
      n = n.parentElement;
    }
    return null;
  }
  function viewLabel(node) {
    var box = hidingAncestor(node);
    if (!box) return null;
    var lbl = box.getAttribute("aria-label") || box.getAttribute("data-view") ||
              box.getAttribute("data-tab") || box.getAttribute("data-v") || "";
    if (!lbl) {
      var h = box.querySelector("h1,h2,h3,legend,summary");
      if (h && h.textContent) lbl = h.textContent.trim().slice(0, 40);
    }
    if (!lbl && box.id) lbl = box.id;
    return lbl || null;
  }

  function isOnCurrentView(t) {
    if (!t || !t.anchor) return true;                 // panel threads belong to the whole page
    var n = t.anchor.sel ? resolveEl(t.anchor.sel) : null;
    if (n) return isRenderable(n);
    if (t.anchor.route != null) return (t.anchor.route || "") === viewKey();
    return true;                                      // legacy pin, unknowable — never hide it in the panel
  }
  function pinDocXY(a) {
    var n = a && a.sel ? resolveEl(a.sel) : null;
    if (n) {
      /* The anchor still exists but its view is not on screen. Falling through to
         the stored dx/dy below would paint this pin on top of whatever view IS
         showing — the bug this guard exists to prevent. Render nothing instead. */
      if (!isRenderable(n)) return null;
      var r = n.getBoundingClientRect();
      if (r.width || r.height) {
        return { x: r.left + window.scrollX + (a.rx || 0) * r.width, y: r.top + window.scrollY + (a.ry || 0) * r.height };
      }
    }
    if (a && a.dx != null) return { x: a.dx, y: a.dy };
    return null;
  }
  function inFixed(node) {
    while (node && node !== document.body && node.nodeType === 1) {
      try { if (getComputedStyle(node).position === "fixed") return true; } catch (_) { return false; }
      node = node.parentElement;
    }
    return false;
  }

  /* ---------- pins ---------- */
  var pinIndex = [];
  var rendering = false;
  function renderPins() {
    if (!overlay || rendering) return;
    rendering = true;
    try { renderPinsInner(); } finally { rendering = false; }
  }
  function renderPinsInner() {
    overlay.innerHTML = "";
    pinIndex = [];
    var n = 0;
    threads.forEach(function (t) {
      if (!t.anchor || t.resolved) return;
      var xy = pinDocXY(t.anchor);
      if (!xy) return;
      n++;
      var pin = el("button", "position:absolute;z-index:99990;width:26px;height:26px;border-radius:50% 50% 50% 4px;background:#D97706;color:#fff;border:2px solid #fff;box-shadow:0 3px 10px rgba(120,60,0,.4);font:700 12px -apple-system,sans-serif;cursor:pointer;padding:0;transform:translate(-50%,-100%);transition:transform .18s ease,box-shadow .18s ease;");
      pin.style.left = xy.x + "px"; pin.style.top = xy.y + "px";
      pin.textContent = String(n);
      pin.title = (t.items && t.items[0] ? (t.items[0].name || "") + ": " + (t.items[0].text || "").slice(0, 80) : "Comment");
      pin.setAttribute("data-pin-ui", "1");
      (function (thread) {
        pin.addEventListener("click", function (e) { e.stopPropagation(); openThreadPopover(thread, pin); });
        pinIndex.push({ thread: thread, node: pin });
      })(t);
      overlay.appendChild(pin);
    });
  }

  /* Called by comments.js "Jump ↧" — scroll the anchor into view, flash the pin,
     and open its thread so the reviewer lands in context, not just near it. */
  function toast(msg) {
    var t = el("div", "position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:100001;background:#33373f;color:#fff;font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:10px 16px;border-radius:9px;box-shadow:0 8px 24px rgba(20,30,50,.28);max-width:340px;text-align:center;", esc(msg));
    t.setAttribute("data-pin-ui", "1");
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  /* Jump across views. If the pin lives on a view that is not open, switch to its
     recorded route, give the app a beat to swap the DOM, then land on it. */
  function jumpTo(thread) {
    var a = thread && thread.anchor;
    if (a) {
      var want = a.route != null ? a.route : null;
      var needSwitch = want !== null && want !== viewKey();
      var here = a.sel ? resolveEl(a.sel) : null;
      var hiddenHere = !!(here && !isRenderable(here));
      if (needSwitch || hiddenHere) {
        if (needSwitch) { try { location.hash = want; } catch (_) {} }
        setTimeout(function () {
          renderPins();
          var still = a.sel ? resolveEl(a.sel) : null;
          if (still && !isRenderable(still)) {
            var lbl = viewLabel(still);
            toast(lbl ? ("That comment is pinned inside \u201c" + lbl + "\u201d \u2014 open that view to see it.")
                      : "That comment is pinned to a view that isn't open right now.");
            return;
          }
          doJump(thread);
        }, 280);
        return;
      }
    }
    doJump(thread);
  }
  function doJump(thread) {
    var target = null;
    for (var i = 0; i < pinIndex.length; i++) {
      var a = pinIndex[i].thread, b = thread;
      var ai = (a.items || [])[0], bi = (b.items || [])[0];
      var idMatch = a.id && b.id && a.id === b.id;
      var itemMatch = ai && bi && ai.at === bi.at && ai.text === bi.text;
      if (idMatch || itemMatch) { target = pinIndex[i]; break; }
    }
    if (!target) {
      var xy = pinDocXY(thread.anchor);
      if (xy) window.scrollTo({ top: Math.max(0, xy.y - window.innerHeight / 3), behavior: "smooth" });
      return;
    }
    var top = parseFloat(target.node.style.top) || 0;
    window.scrollTo({ top: Math.max(0, top - window.innerHeight / 3), behavior: "smooth" });
    target.node.style.transform = "translate(-50%,-100%) scale(1.5)";
    target.node.style.boxShadow = "0 0 0 8px rgba(217,119,6,.28)";
    setTimeout(function () {
      target.node.style.transform = "translate(-50%,-100%)";
      target.node.style.boxShadow = "0 3px 10px rgba(120,60,0,.4)";
      openThreadPopover(target.thread, target.node);
    }, 520);
  }

  /* ---------- popovers ---------- */
  function closePopover() { if (popover) { popover.remove(); popover = null; } }
  function placePopover(box, vx, vy) {
    document.body.appendChild(box);
    var w = box.offsetWidth || 320, h = box.offsetHeight || 200;
    var left = Math.min(Math.max(8, vx + 12), window.innerWidth - w - 8);
    var top = vy + 12;
    if (top + h > window.innerHeight - 8) top = Math.max(8, vy - h - 12);
    box.style.left = left + "px"; box.style.top = top + "px";
  }
  function baseBox() {
    closePopover();
    var box = el("div", "position:fixed;z-index:100001;width:320px;max-width:calc(100vw - 24px);background:#fff;border:1px solid #e2ded6;border-radius:14px;box-shadow:0 18px 50px rgba(20,30,50,.25);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;overflow:hidden;");
    box.setAttribute("data-pin-ui", "1");
    box.addEventListener("click", function (e) { e.stopPropagation(); });
    popover = box;
    return box;
  }

  function openComposer(anchor, vx, vy) {
    var box = baseBox();
    var head = el("div", "display:flex;justify-content:space-between;align-items:center;padding:11px 14px 9px;border-bottom:1px solid #f1efe9;");
    head.appendChild(el("span", "font:700 13px -apple-system,sans-serif;color:#1a1d24;", "📍 New pinned comment"));
    var x = el("button", "border:none;background:none;font-size:16px;cursor:pointer;color:#9aa0aa;padding:2px 4px;", "✕");
    x.addEventListener("click", closePopover);
    head.appendChild(x); box.appendChild(head);
    var body = el("div", "padding:10px 14px 14px;");
    body.appendChild(el("div", "font-size:11px;color:#9aa0aa;margin-bottom:7px;", "Commenting as <b style='color:#33373f'>" + esc(me.name) + "</b>" + (me.email ? " · " + esc(me.email) : "")));
    var ta = el("textarea", "width:100%;box-sizing:border-box;font:inherit;font-size:13.5px;color:#1a1d24;background:#fbfbf9;border:1.5px solid #e7e6e1;border-radius:10px;padding:9px;resize:vertical;min-height:74px;");
    ta.placeholder = "What about this spot?";
    var post = el("button", "margin-top:8px;width:100%;font:600 13.5px -apple-system,sans-serif;color:#fff;background:#D97706;border:none;border-radius:9px;padding:10px;cursor:pointer;", "Post pin");
    function submit() {
      var v = ta.value.trim(); if (!v) return;
      post.disabled = true; post.textContent = "Posting…";
      mutate(function (arr) {
        arr.push({ id: uid("t"), section: "general", sectionLabel: "📍 Pin", resolved: false, anchor: anchor,
          items: [{ id: uid("c"), email: me.email, name: me.name, text: v, at: new Date().toISOString(), mentions: [] }] });
      }).then(closePopover);
    }
    post.addEventListener("click", submit);
    ta.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); });
    body.appendChild(ta); body.appendChild(post);
    body.appendChild(el("div", "font-size:11px;color:#9aa0aa;margin-top:7px;text-align:center;", "⌘/Ctrl+Enter to post · Esc to close"));
    box.appendChild(body);
    placePopover(box, vx, vy);
    setTimeout(function () { ta.focus(); }, 30);
  }

  function openThreadPopover(t, pinEl) {
    var box = baseBox();
    var head = el("div", "display:flex;justify-content:space-between;align-items:center;padding:11px 14px 9px;border-bottom:1px solid #f1efe9;");
    head.appendChild(el("span", "font:700 13px -apple-system,sans-serif;color:#1a1d24;", "📍 Pinned thread"));
    var right = el("div", "display:flex;gap:6px;align-items:center;");
    var res = el("button", "font:600 11px -apple-system,sans-serif;cursor:pointer;border:1px solid #d6dae0;background:#fff;border-radius:7px;padding:4px 9px;color:#33373f;", "Resolve ✓");
    res.addEventListener("click", function () {
      mutate(function (arr) {
        for (var i = 0; i < arr.length; i++) if (arr[i].id === t.id) { arr[i].resolved = true; break; }
      }).then(closePopover);
    });
    var x = el("button", "border:none;background:none;font-size:16px;cursor:pointer;color:#9aa0aa;padding:2px 4px;", "✕");
    x.addEventListener("click", closePopover);
    right.appendChild(res); right.appendChild(x);
    head.appendChild(right); box.appendChild(head);

    var stream = el("div", "max-height:260px;overflow-y:auto;padding:4px 14px 6px;");
    (t.items || []).forEach(function (it, idx) {
      var w = el("div", "padding:8px 0;" + (idx ? "border-top:1px dashed #f0efea;" : ""));
      var h = el("div", "display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;");
      h.appendChild(el("span", "font-weight:700;font-size:12.5px;color:#1a1d24;", esc(it.name || deriveName(it.email))));
      var meta = el("span", "display:flex;align-items:center;gap:6px;white-space:nowrap;");
      meta.appendChild(el("span", "font-size:10.5px;color:#9aa0aa;", fmtTime(it.at)));
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
            mutate(function (arr) {
              for (var i = 0; i < arr.length; i++) if (arr[i].id === t.id) {
                arr[i].items = (arr[i].items || []).filter(function (x) { return x.id !== item.id; });
                if (!arr[i].items.length) arr.splice(i, 1);
                break;
              }
            }).then(closePopover);
          });
        })(it);
        meta.appendChild(delBtn);
      }
      h.appendChild(meta);
      w.appendChild(h);
      w.appendChild(el("div", "font-size:13px;line-height:1.5;color:#33373f;white-space:pre-wrap;", esc(it.text)));
      stream.appendChild(w);
    });
    box.appendChild(stream);

    var foot = el("div", "padding:8px 14px 13px;border-top:1px solid #f1efe9;");
    var ta = el("textarea", "width:100%;box-sizing:border-box;font:inherit;font-size:13px;color:#1a1d24;background:#fbfbf9;border:1.5px solid #e7e6e1;border-radius:9px;padding:8px;resize:vertical;min-height:36px;");
    ta.placeholder = "Reply…";
    var send = el("button", "margin-top:6px;font:600 12.5px -apple-system,sans-serif;color:#fff;background:#1864E6;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;", "Reply");
    function reply() {
      var v = ta.value.trim(); if (!v) return;
      mutate(function (arr) {
        for (var i = 0; i < arr.length; i++) if (arr[i].id === t.id) {
          arr[i].items.push({ id: uid("c"), email: me.email, name: me.name, text: v, at: new Date().toISOString(), mentions: [] });
          if (arr[i].resolved) arr[i].resolved = false;
          break;
        }
      }).then(closePopover);
    }
    send.addEventListener("click", reply);
    ta.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") reply(); });
    foot.appendChild(ta); foot.appendChild(send);
    box.appendChild(foot);

    var r = pinEl.getBoundingClientRect();
    placePopover(box, r.left + 13, r.top + 13);
  }

  /* ---------- pointer mode ---------- */
  function setMode(on) {
    mode = on;
    document.documentElement.classList.toggle("pin-mode", on);
    if (toolbar) {
      toolbar.innerHTML = on
        ? '<span style="width:8px;height:8px;border-radius:50%;background:#fff;animation:pinPulse 1s infinite;"></span> Click anywhere to comment · Esc to cancel'
        : '📍 Add comment <span style="opacity:.72;font-weight:500;">(C)</span>';
      toolbar.style.background = on ? "#B45309" : "#D97706";
    }
    if (!on) closePopover();
  }
  function onDocClick(e) {
    if (!mode) return;
    if (inFixed(e.target) || (e.target.closest && e.target.closest("[data-pin-ui]"))) return;
    e.preventDefault(); e.stopPropagation();
    var target = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    if (!target) return;
    var r = target.getBoundingClientRect();
    var anchor = {
      sel: cssPath(target),
      rx: r.width ? (e.clientX - r.left) / r.width : 0,
      ry: r.height ? (e.clientY - r.top) / r.height : 0,
      dx: e.pageX, dy: e.pageY,
      route: viewKey()
    };
    setMode(false);
    openComposer(anchor, e.clientX, e.clientY);
  }
  function onKey(e) {
    var tag = (e.target && e.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable);
    if (e.key === "Escape") { if (mode) setMode(false); else closePopover(); return; }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.code === "KeyC" || String(e.key).toLowerCase() === "c")) { e.preventDefault(); setMode(!mode); return; }
    if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "c" || e.key === "C")) setMode(!mode);
  }

  /* A view change is a render trigger. Tabs, accordions and routers all swap views
     by mutating class/style/hidden — none of which fires a load or a resize, so
     without this the pins from the previous view stay painted on the new one. */
  var reT = null;
  function scheduleRender() { clearTimeout(reT); reT = setTimeout(renderPins, 90); }
  function watchViewChanges() {
    window.addEventListener("hashchange", scheduleRender);
    window.addEventListener("popstate", scheduleRender);
    window.addEventListener("resize", scheduleRender);
    try {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var t = muts[i].target;
          /* never react to our own UI, or we loop forever */
          if (t && t.nodeType === 1 && t.closest && t.closest("[data-pin-ui],[data-comments-ui]")) continue;
          scheduleRender();
          return;
        }
      }).observe(document.body, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-selected", "aria-hidden", "open"]
      });
    } catch (_) {}
  }

  function connectWS() {
    try {
      ws = new WebSocket("wss://" + location.host + "/ws");
      ws.onmessage = function (e) {
        try {
          var env = JSON.parse(e.data);
          if (env && env.data && env.data.kind === "comment" && env.data.page === PAGE) loadThreads().then(renderPins);
        } catch (_) {}
      };
    } catch (_) {}
  }

  function build() {
    var st = document.createElement("style");
    st.textContent = ".pin-mode, .pin-mode * { cursor: crosshair !important; } @keyframes pinPulse {0%,100%{opacity:1}50%{opacity:.35}}";
    document.head.appendChild(st);

    overlay = el("div", "position:absolute;top:0;left:0;width:100%;height:0;overflow:visible;z-index:99990;pointer-events:none;");
    overlay.setAttribute("data-pin-ui", "1");
    document.body.appendChild(overlay);
    new MutationObserver(function () {
      Array.prototype.forEach.call(overlay.children, function (c) { c.style.pointerEvents = "auto"; });
    }).observe(overlay, { childList: true });

    toolbar = el("button", "position:fixed;top:14px;right:20px;z-index:99997;display:flex;align-items:center;gap:8px;font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#fff;background:#D97706;border:none;border-radius:100px;padding:11px 16px;cursor:pointer;box-shadow:0 5px 16px rgba(180,83,9,.35);");
    toolbar.setAttribute("data-pin-ui", "1");
    toolbar.addEventListener("click", function (e) { e.stopPropagation(); setMode(!mode); });
    document.body.appendChild(toolbar);
    setMode(false);

    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", renderPins);
    window.addEventListener("cw-saved", function () { loadThreads().then(renderPins); });
    window.addEventListener("load", function () { setTimeout(renderPins, 300); });
  }

  function boot() {
    build();
    Promise.all([
      fetch("/api/me").then(function (r) { return r.ok ? r.json() : {}; }).then(function (m) {
        me.email = (m && m.email) || ""; me.name = deriveName(me.email);
      }).catch(function () {}),
      loadThreads()
    ]).then(renderPins);
    connectWS();
    watchViewChanges();
    window.__pinComments = {
      isOnCurrentView: isOnCurrentView,
      viewKey: viewKey,
      jump: jumpTo,
      /* Force a re-render. Only needed when a framework replaces the view wholesale
         in a way the MutationObserver can't attribute to a visibility change. */
      refresh: function () { renderPins(); },
      addMode: function () { setMode(true); },
      count: function () { return threads.filter(function (t) { return t.anchor && !t.resolved; }).length; }
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
