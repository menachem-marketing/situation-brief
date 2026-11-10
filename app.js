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

  function cardId(id) {
    return id ? ' id="item-' + String(id).replace(/[^A-Za-z0-9_-]/g, "") + '"' : "";
  }

  function renderItem(it) {
    var html = "<article" + cardId(it.id) + '><div class="meta">';
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

  /* Optional map: items may carry location or locations[] with
     {label, latitude, longitude, accuracy, note}. All current anchors are
     approximate locality centers; notes are shown verbatim in the popup. */
  var map = null, mapLayer = null, didHashScroll = false;

  function locatedItems(sections) {
    var out = [];
    for (var i = 0; i < sections.length; i++) {
      var items = Array.isArray(sections[i].items) ? sections[i].items : [];
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var locs = Array.isArray(it.locations) ? it.locations : (it.location ? [it.location] : []);
        locs = locs.filter(function (l) {
          return l && isFinite(+l.latitude) && isFinite(+l.longitude) &&
                 Math.abs(+l.latitude) <= 90 && Math.abs(+l.longitude) <= 180;
        });
        if (locs.length) out.push({ item: it, locations: locs });
      }
    }
    return out;
  }

  function updateMap(sections) {
    var sec = document.getElementById("mapsec");
    if (!sec) return;
    var hits = locatedItems(sections);
    if (!hits.length) { sec.hidden = true; return; }
    if (!window.L) { sec.hidden = true; return; }
    sec.hidden = false;
    if (!map) {
      map = L.map("map", { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      map.setView([31.6, 35.05], 8);
      mapLayer = L.layerGroup().addTo(map);
    }
    mapLayer.clearLayers();
    var bounds = [];
    for (var i = 0; i < hits.length; i++) {
      (function (h) {
        for (var k = 0; k < h.locations.length; k++) {
          var loc = h.locations[k];
          var approx = loc.accuracy === "approximate";
          var mk = L.marker([+loc.latitude, +loc.longitude], {
            icon: L.divIcon({ className: "pin " + (approx ? "pin-approx" : "pin-exact"), iconSize: [16, 16] }),
            title: h.item.title || ""
          });
          var html = "<b>" + esc(h.item.title || "") + "</b>";
          if (loc.label) html += '<div class="pop-label">' + esc(loc.label) + "</div>";
          if (approx) html += '<div class="pop-acc">מיקום משוער</div>';
          if (loc.note) html += '<div class="pop-note">' + esc(loc.note) + "</div>";
          if (h.item.id) html += '<a href="#item-' + String(h.item.id).replace(/[^A-Za-z0-9_-]/g, "") + '">לכרטיס הדיווח המלא</a>';
          mk.bindPopup(html);
          mapLayer.addLayer(mk);
          bounds.push([+loc.latitude, +loc.longitude]);
        }
      })(hits[i]);
    }
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
    else if (bounds.length === 1) map.setView(bounds[0], 9);
    setTimeout(function () { map.invalidateSize(); }, 50);
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
    var srcTotal = 0;
    for (var si = 0; si < sections.length; si++) {
      var sItems = Array.isArray(sections[si].items) ? sections[si].items : [];
      for (var sj = 0; sj < sItems.length; sj++) {
        if (Array.isArray(sItems[sj].sources)) srcTotal += sItems[sj].sources.length;
      }
    }
    if (!didHashScroll && location.hash.length > 1) {
      var hashTarget = document.getElementById(location.hash.slice(1));
      if (hashTarget) { didHashScroll = true; setTimeout(function () { hashTarget.scrollIntoView(); }, 0); }
    }
    var statsEl = document.getElementById("stats");
    if (statsEl) statsEl.textContent = count ? (count + " דיווחים · " + srcTotal + " מקורות") : "";
    updateMap(sections);
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
