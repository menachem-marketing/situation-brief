/* Standalone renderer for the public situation brief.
   All content arrives in data.json; this file contains no editorial data. */
(function () {
  "use strict";

  var POLL_MS = 120000; // re-check data.json every 2 minutes
  var lastGenerated = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u == null ? "" : u)) ? String(u) : null;
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" });
  }

  function fmtUpdated(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return "עודכן " + d.toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" });
  }

  function link(name, url) {
    var u = safeUrl(url);
    if (!name) return "";
    if (u) return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + "</a>";
    return esc(name);
  }

  function renderSources(it) {
    var out = [];
    if (Array.isArray(it.sources)) {
      for (var i = 0; i < it.sources.length; i++) {
        var s = it.sources[i], name = null, url = null;
        if (Array.isArray(s)) { name = s[0]; url = s[1]; }
        else if (s && typeof s === "object") { name = s.name; url = s.url; }
        else { name = s; }
        var h = link(name, url);
        if (h) out.push(h);
      }
    }
    if (!out.length && it.source_name) {
      var single = link(it.source_name, it.source_url);
      if (single) out.push(single);
    }
    return out;
  }

  function renderItem(it) {
    var html = '<article><div class="meta">';
    // time_label is the source's exact original label (mixed date/time wording);
    // it is shown verbatim and never reinterpreted. ISO "time" is the fallback.
    if (it.time_label) html += "<time>" + esc(it.time_label) + "</time>";
    else if (it.time) html += "<time>" + esc(fmtTime(it.time)) + "</time>";
    if (it.region) html += '<span class="badge">' + esc(it.region) + "</span>";
    if (it.verification) html += '<span class="badge">' + esc(it.verification) + "</span>";
    html += "</div>";
    if (it.title) html += "<h3>" + esc(it.title) + "</h3>";
    var lead = it.brief || it.summary; // brief is the curated lead; summary is the verbose fallback
    if (lead) html += "<p>" + esc(lead) + "</p>";
    if (it.detail) {
      html += '<details class="more"><summary>' + esc(it.detail_label || "פירוט נוסף") + "</summary><p>" + esc(it.detail) + "</p></details>";
    }
    var srcs = renderSources(it);
    if (srcs.length) {
      html += '<div class="src">' + (srcs.length > 1 ? "מקורות: " : "מקור: ") + srcs.join(" · ") + "</div>";
    }
    return html + "</article>";
  }

  function render(data) {
    var updatedEl = document.getElementById("updated");
    var content = document.getElementById("content");
    updatedEl.textContent = data.generated_at ? fmtUpdated(data.generated_at) : "";
    var sections = Array.isArray(data.sections) ? data.sections : [];
    var html = "";
    var count = 0;
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      var items = Array.isArray(sec.items) ? sec.items : [];
      if (!items.length) continue;
      count += items.length;
      html += "<section><h2>" + esc(sec.title || "") + "</h2>";
      for (var j = 0; j < items.length; j++) html += renderItem(items[j]);
      html += "</section>";
    }
    content.innerHTML = count ? html : '<div class="empty">אין פריטים עדיין.</div>';
  }

  function load() {
    fetch("data.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (data) {
        if (data && data.generated_at !== lastGenerated) {
          lastGenerated = data ? data.generated_at : null;
          render(data);
        }
      })
      .catch(function () {
        var content = document.getElementById("content");
        if (!lastGenerated) content.innerHTML = '<div class="empty">לא ניתן לטעון נתונים כרגע.</div>';
      });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  load();
  setInterval(load, POLL_MS);
})();
