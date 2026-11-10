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

  function renderItem(it) {
    var html = '<article><div class="meta">';
    if (it.time) html += "<time>" + esc(fmtTime(it.time)) + "</time>";
    if (it.verification) html += '<span class="badge">' + esc(it.verification) + "</span>";
    html += "</div>";
    if (it.title) html += "<h3>" + esc(it.title) + "</h3>";
    if (it.summary) html += "<p>" + esc(it.summary) + "</p>";
    if (it.source_url && it.source_name) {
      html += '<div class="src">מקור: <a href="' + esc(it.source_url) + '" target="_blank" rel="noopener noreferrer">' + esc(it.source_name) + "</a></div>";
    } else if (it.source_name) {
      html += '<div class="src">מקור: ' + esc(it.source_name) + "</div>";
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
