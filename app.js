/* Standalone renderer for the public situation brief.
   All content arrives in data.json; this file contains no editorial data. */
(function () {
  "use strict";

  var POLL_MS = 120000; // re-check data.json every 2 minutes
  var lastGenerated = null, lastPayload = null, currentData = null, activeFilter = "all";

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
    return d.toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" });
  }

  function fmtUpdated(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return "בדיקה " + d.toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" });
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
    if (locatedItems([{items:[it]}]).length) html += '<button class="card-action" data-map-id="'+esc(it.id)+'">הצגה במפה</button>';
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

  function allReports(data) {
    return data.sections.filter(function(s){return s.key !== "coverage";}).reduce(function(a,s){return a.concat(s.items||[]);},[]);
  }
  var filterDefs = [["all","הכול"],["jerusalem","ירושלים ועוטף"],["wb","איו״ש"],["crossings","מעברים וצירים"],["national","ארצי"]];
  function matches(it) {
    if(activeFilter === "all") return true;
    return activeFilter === "jerusalem" ? /ירושלים/.test(it.region||"") : activeFilter === "wb" ? it.region === "איו״ש" : activeFilter === "crossings" ? it.region === "מחסומים וצירים" : it.region === "ישראל";
  }
  function showGroup(group) {
    var panel=document.getElementById("map-detail"); panel.hidden=false;
    panel.innerHTML='<h3>'+ (group.length>1 ? group.length+' סימונים סמוכים - בחירת דיווח' : 'פרטי הסימון')+'</h3><p>מרכזי יישובים להתמצאות בלבד. אין כאן נקודת אירוע מדויקת.</p>'+group.map(function(h){return '<article><h3>'+esc(h.item.title)+'</h3><p>'+esc(h.location.label)+' · '+(h.location.accuracy==='approximate'?'מיקום משוער':'מיקום לפי המקור')+'</p><p>'+esc(h.location.note||'')+'</p><p>'+esc(h.item.time_label||'')+' · '+esc(h.item.verification||'')+'</p><div class="map-links"><a href="#item-'+esc(h.item.id)+'">לכרטיס הדיווח המלא</a></div></article>';}).join('');
    panel.scrollIntoView({block:'nearest'});
  }
  var mapHits=[], markerById={};
  function drawMarkers() {
    if(!mapLayer) return;
    mapLayer.clearLayers(); markerById={};
    var groups=[];
    mapHits.forEach(function(h){var pt=map.latLngToContainerPoint([h.location.latitude,h.location.longitude]);groups.push({hits:[h],points:[pt]});});
    // Merge overlapping touch targets, including transitive overlaps. No displaced incident pins.
    var merged=true;
    while(merged){merged=false;outer:for(var i=0;i<groups.length;i++)for(var j=i+1;j<groups.length;j++){
      if(groups[i].points.some(function(p){return groups[j].points.some(function(q){return p.distanceTo(q)<50;});})){
        groups[i].hits=groups[i].hits.concat(groups[j].hits);groups[i].points=groups[i].points.concat(groups[j].points);groups.splice(j,1);merged=true;break outer;
      }
    }}
    groups.forEach(function(g){var sum=g.points.reduce(function(a,p){a.x+=p.x;a.y+=p.y;return a;},{x:0,y:0});var center=map.containerPointToLatLng([sum.x/g.points.length,sum.y/g.points.length]);
      var label=g.hits.length>1 ? g.hits.length+' סימונים סמוכים, פתיחת רשימה' : g.hits[0].item.title+' - מיקום משוער';
      var mk=L.marker(center,{icon:L.divIcon({className:'pin',html:'<span class="'+(g.hits.length>1?'cluster':'')+'">'+(g.hits.length>1?g.hits.length:'')+'</span>',iconSize:[44,44],iconAnchor:[22,22]}),title:label,alt:label});
      mk.on('click',function(){showGroup(g.hits);});mapLayer.addLayer(mk);if(mk.getElement())mk.getElement().setAttribute('aria-label',label);g.hits.forEach(function(h){markerById[h.item.id]=mk;});
    });
  }
  function updateMap(sections) {
    var sec=document.getElementById('mapsec'),hits=locatedItems(sections);
    document.getElementById('map-detail').hidden=true;
    mapHits=[];hits.forEach(function(h){h.locations.forEach(function(l){mapHits.push({item:h.item,location:l});});});
    if(!mapHits.length||!window.L){sec.hidden=true;return;}sec.hidden=false;
    if(!map){map=L.map('map',{scrollWheelZoom:false});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);mapLayer=L.layerGroup().addTo(map);map.on('zoomend',drawMarkers);}
    map.invalidateSize();
    var bounds=mapHits.map(function(h){return [h.location.latitude,h.location.longitude];});
    map.fitBounds(bounds,{padding:[35,35],maxZoom:12,animate:false});drawMarkers();
  }
  function render(data) {
    currentData=data;
    document.getElementById('updated').textContent=data.generated_at ? fmtUpdated(data.generated_at):'';
    var reports=allReports(data),visible=reports.filter(matches),located=locatedItems([{items:visible}]).length;
    document.getElementById('stats').textContent=reports.length+' דיווחים · '+reports.reduce(function(n,it){return n+(it.sources||[]).length;},0)+' קישורי מקור (לא בהכרח עצמאיים)';
    document.getElementById('filters').innerHTML=filterDefs.map(function(f){return '<button data-filter="'+f[0]+'" aria-pressed="'+(f[0]===activeFilter)+'">'+f[1]+'</button>';}).join('');
    document.getElementById('result-count').innerHTML='מוצגים '+visible.length+' דיווחים: '+located+' עם מיקום משוער · '+(visible.length-located)+' ללא מיקום במפה. <a href="#content">לרשימה</a>';
    var changes=data.edition_changes;
    var ids=changes ? (changes.added||[]).concat(changes.updated||[]) : [];
    var changed=reports.filter(function(it){return ids.indexOf(it.id)>=0;});
    document.getElementById('changes').innerHTML='<h2>השינוי האחרון ברשימה</h2>'+(changes ? '<p>עודכן '+esc(fmtTime(changes.changed_at))+' · בהשוואה לבדיקה '+esc(fmtTime(changes.compared_to))+'. '+(changed.length ? 'דיווחים שנוספו או עודכנו:' : 'לא השתנו הדיווחים שנבחרו; זמן הבדיקה עודכן.')+'</p>'+ (changed.length?'<ul>'+changed.map(function(it){return '<li><a href="#item-'+esc(it.id)+'">'+esc(it.title)+'</a></li>';}).join('')+'</ul>':'') : '<p>אין עדיין השוואה למהדורה קודמת.</p>')+'<p>זמן הבדיקה אינו זמן האירוע. התאריכים וההסתייגויות מופיעים בכל כרטיס.</p>';
    var html='<section><h2>הדיווחים הנבחרים</h2>'+(visible.length?visible.map(renderItem).join(''):'<p class="empty">אין דיווחים בסינון הזה.</p>')+'</section>';
    data.sections.filter(function(s){return s.key==='coverage';}).forEach(function(s){html+='<section><h2>'+esc(s.title)+'</h2>'+(s.items||[]).map(renderItem).join('')+'</section>';});
    document.getElementById('content').innerHTML=html;
    updateMap([{items:visible}]);
    if(!didHashScroll && location.hash.length>1){var target=document.getElementById(location.hash.slice(1));if(target){didHashScroll=true;target.scrollIntoView();}}
  }
  document.addEventListener('click',function(e){
    var f=e.target.closest('[data-filter]');if(f){activeFilter=f.dataset.filter;render(currentData);return;}
    var m=e.target.closest('[data-map-id]');if(m&&map){var hits=mapHits.filter(function(h){return String(h.item.id)===m.dataset.mapId;});if(hits.length){showGroup(hits);document.getElementById('mapsec').scrollIntoView();}return;}
    var a=e.target.closest('a[href^="#item-"]');if(a){var target=document.getElementById(a.getAttribute('href').slice(1));if(!target&&activeFilter!=='all'){activeFilter='all';render(currentData);target=document.getElementById(a.getAttribute('href').slice(1));}if(target){e.preventDefault();history.replaceState(null,'',a.getAttribute('href'));target.scrollIntoView();target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}}
  });

  function load() {
    fetch("data.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (data) {
        if (data && JSON.stringify(data) !== lastPayload) {
          lastPayload = JSON.stringify(data);
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
