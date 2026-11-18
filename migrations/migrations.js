/* Migrations: every immigrant ancestor, from where they were born to where they first turn up in America, and the
   whole direct line gathering generation by generation into the home person, on an animated canvas map. Loaded on demand by app.js, with basemap.js.
   Uses app.js's globals (api, esc, fmt, showTip, hideTip, $, $$). No network calls. */
"use strict";
(function () {
  const COLORS = { England: "#C2483A", Germany: "#D6A21E", Scotland: "#3F7CC0", Ireland: "#3B9A5F",
    Netherlands: "#EA7F2C", France: "#8A63C2", Wales: "#D45F97" };
  const OTHER = "#8C9AA0";
  const color = (c) => COLORS[c] || OTHER;
  // the same countries as light on the dark map stage
  const GLOW = { England: "#E3B95F", Germany: "#E8805F", Scotland: "#7FAAE6", Ireland: "#7CCB98",
    Netherlands: "#C9A0E8", France: "#EE95B8", Wales: "#6FD3D3" };
  const glow = (c) => GLOW[c] || "#A9B6C4";
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
  const SERIF = window.KF_SERIF || '"Palatino Linotype", "Book Antiqua", Palatino, "Iowan Old Style", Georgia, serif';   // a host page may set its own face
  const SANS = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const K = 10;                       // map units per degree of longitude
  const VIEWS = { atlantic: [-98, 22, 24, 62], america: [-100, 26, -62, 49] };

  const proj = (lon, lat) => {
    const phi = (Math.max(-80, Math.min(80, lat)) * Math.PI) / 180;
    return [lon * K, (-K * 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * phi)) * 180) / Math.PI];
  };
  const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; return (x % 1000) / 1000; };
  // places are matched to a county, region or country centre: spread the people who share one, so each is seen
  const jitter = (pt, seed, precision) => {
    const r = { county: 0.12, region: 0.35, state: 0.6, country: 1.1 }[precision] || 0.3;
    const a = hash(seed) * 6.283, m = Math.sqrt(hash(seed * 7 + 3)) * r;
    return [pt.lon + Math.cos(a) * m * 1.3, pt.lat + Math.sin(a) * m];
  };
  const rect = ([w, s, e, n]) => { const [x0, y0] = proj(w, n), [x1, y1] = proj(e, s); return [x0, y0, x1 - x0, y1 - y0]; };
  const st = { view: "map", year: null, playing: false, speed: 1, countries: new Set(), side: "all", stateFilter: null,
    sel: null, moves: false, keep: false, everyone: false, sort: "year", q: "" };

  async function render(viewEl) {
    st.sel = null; st.playing = false;
    const d = await api(`/api/migrations${st.everyone ? "?all=1" : ""}`);
    if (!d.tree) { viewEl.innerHTML = head("") + `<p class="muted">Add the family tree on <a href="#/sources">Data</a> first.</p>`; return; }
    const people = d.people;
    if (!people.length) {
      viewEl.innerHTML = head("") + `<section class="panel"><p>No immigrants found yet. Kinfold looks for people born outside the United States who have an American record of their own, or a child born in America.</p></section>`;
      return;
    }
    people.forEach((p) => {
      p.c = color(p.country);
      p.o = proj(...jitter(p.origin, p.id, p.origin.precision));
      p.l = proj(...jitter(p.landing, p.id + 100003, p.landing.precision === "county" ? "county" : "region"));
      const [ox, oy] = p.o, [lx, ly] = p.l, dx = lx - ox, dy = ly - oy, dist = Math.hypot(dx, dy) || 1;
      const bend = 0.18 + hash(p.id) * 0.12;     // arcs bow northward like a great circle, each a little differently
      p.q = [(ox + lx) / 2 + (dy / dist) * dist * bend * Math.sign(dx || 1), (oy + ly) / 2 - Math.abs(dx / dist) * dist * bend];
      const pts = [p.l];
      p.trail.forEach((t) => {
        if (p.landing.year && t.year && t.year < p.landing.year) return;
        const q = proj(t.lon, t.lat), last = pts[pts.length - 1];
        if (Math.hypot(q[0] - last[0], q[1] - last[1]) > 2) pts.push(Object.assign(q, { year: t.year || p.died || null }));
      });
      p.moves = pts;
      p.landing = p.trail.find((t) => t.place === p.landing.place && t.year === p.landing.year && t.what === p.landing.what) || p.landing;
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    const facts = insights(d, people);
    viewEl.innerHTML = head(d) + `<div class="stack mig">
      <div class="mig-facts">${facts.map((f) => `<div class="mig-fact"><b>${f[0]}</b><span>${f[1]}</span></div>`).join("")}</div>
      <div class="toolbar mig-bar">
        <div class="seg" role="group" aria-label="View">${[["map", "Map"], ["flows", "From → to"], ["list", "List"]].map(([k, l]) => `<button data-mv="${k}" class="${st.view === k ? "on" : ""}" aria-pressed="${st.view === k}">${l}</button>`).join("")}</div>
        <div class="seg" role="group" aria-label="Side">${[["all", "Both sides"], ["paternal", "Father's side"], ["maternal", "Mother's side"]].map(([k, l]) => `<button data-ms="${k}" class="${st.side === k ? "on" : ""}" aria-pressed="${st.side === k}">${l}</button>`).join("")}</div>
        <label class="small"><input type="checkbox" id="mg-all" ${st.everyone ? "checked" : ""}> Everyone in the tree</label>
      </div>
      <div class="mig-legend" id="mg-legend-out"></div>
      <div id="mg-body"></div>
      ${d.n_unplaced ? `<details class="small muted"><summary>${d.n_unplaced} more ${d.n_unplaced === 1 ? "immigrant isn't" : "immigrants aren't"} on the map</summary><ul>${d.unplaced.map((u) => `<li>${u.person_id ? `<a href="#/person/${u.person_id}">${esc(u.name)}</a>` : esc(u.name)}: ${esc(u.birth_place || "no birthplace")} (${esc(u.why)})</li>`).join("")}</ul></details>` : ""}
      <p class="mig-note small muted"><i>${(window.KF_TEXT && window.KF_TEXT.note) || "Each year is the arrival record, or the first American record, so most crossings came a little earlier. Colonial borders are today's state lines; from 1783 they are as they stood. An ancestor with no recorded birthplace is shown at their first record, or with their child."}</i></p>
    </div>`;

    const visible = (p) => (!st.countries.size || st.countries.has(p.country)) && (st.side === "all" || p.side === st.side) && (!st.stateFilter || p.state === st.stateFilter);
    let cur = null;                       // the running map stage, if that is the view
    const legend = () => {
      const onMap = st.view === "map", el = onMap ? $("#mg-legend") : $("#mg-legend-out"), col = onMap ? glow : color;
      $("#mg-legend-out").hidden = onMap;
      if (!el) return;
      const again = () => { if (cur) { cur.refresh(); legend(); } else body(); };
      const n = new Map();
      people.filter((p) => (st.side === "all" || p.side === st.side)).forEach((p) => n.set(p.country, (n.get(p.country) || 0) + 1));
      el.innerHTML = [...n].sort((a, b) => b[1] - a[1]).map(([c, k]) => `<button class="mig-chip ${st.countries.size && !st.countries.has(c) ? "off" : ""}" data-mc="${esc(c)}" aria-pressed="${!st.countries.size || st.countries.has(c)}"><i style="background:${col(c)}"></i>${esc(c)} <b>${k}</b></button>`).join("")
        + (st.countries.size || st.stateFilter ? `<button class="mig-chip" id="mg-clear">Show all${st.stateFilter ? ` (now only ${esc(st.stateFilter)})` : ""}</button>` : "");
      $$("[data-mc]").forEach((b) => b.addEventListener("click", (e) => {
        const c = b.dataset.mc;
        if (e.shiftKey || e.ctrlKey || e.metaKey) st.countries.has(c) ? st.countries.delete(c) : st.countries.add(c);
        else st.countries = st.countries.size === 1 && st.countries.has(c) ? new Set() : new Set([c]);
        again();
      }));
      const cl = $("#mg-clear");
      if (cl) cl.addEventListener("click", () => { st.countries = new Set(); st.stateFilter = null; again(); });
    };
    let stop = () => {};
    const body = () => {
      stop();
      stop = () => {};
      cur = null;
      if (st.view === "map") { cur = mapView($("#mg-body"), d, people, byId, visible); stop = cur.stop; }
      else if (st.view === "flows") flowsView($("#mg-body"), people, visible, () => { st.view = "map"; syncSeg(); body(); });
      else listView($("#mg-body"), people, visible, (id) => { st.sel = id; st.view = "map"; syncSeg(); body(); });
      legend();
    };
    const syncSeg = () => $$("[data-mv]").forEach((b) => { b.classList.toggle("on", b.dataset.mv === st.view); b.setAttribute("aria-pressed", String(b.dataset.mv === st.view)); });
    $$("[data-mv]").forEach((b) => b.addEventListener("click", () => { st.view = b.dataset.mv; syncSeg(); body(); }));
    $$("[data-ms]").forEach((b) => b.addEventListener("click", () => {
      st.side = b.dataset.ms;
      $$("[data-ms]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); });
      if (cur) { cur.refresh(); legend(); } else body();
    }));
    $("#mg-all").addEventListener("change", (e) => { st.everyone = e.target.checked; stop(); render(viewEl); });
    body();
    const off = () => { stop(); removeEventListener("hashchange", off); };
    addEventListener("hashchange", off);
  }

  /* what the film shows: every direct-line ancestor, the immigrants among them, and where the lines meet */
  function head(d) {
    const whose = d && d.home ? `${esc(d.home)}’s` : "the";
    if (!d || !d.people) return `<div class="page-head"><div><h1>${esc((window.KF_TEXT && window.KF_TEXT.title) || "Migrations")}</h1></div></div>`;
    if (d.everyone) return `<div class="page-head"><div><h1>${esc((window.KF_TEXT && window.KF_TEXT.title) || "Migrations")}</h1><p>${fmt(d.people.length)} first-generation Americans in ${whose} tree, from where they were born to where they first appear in America.</p></div></div>`;
    const line = d.descent || [], anc = new Set(line.filter((n) => n.a > 1).map((n) => n.id)).size;
    const gens = line.length ? Math.max(...line.map((n) => n.a)).toString(2).length : 0, home = line[0];
    const town = home ? ((home.place || "").split(",")[0].trim() === home.region || home.precision === "state" ? home.region : `${(home.place || "").split(",")[0].trim()}, ${home.region}`) : "";
    const p = anc ? `${fmt(anc)} known direct-line ancestors, across ${gens} generations: the ${fmt(d.people.length)} who came to America from abroad, and every line of descent that converges to the latest Birth.`
      : `${fmt(d.people.length)} of ${whose} direct-line ancestors came to America from abroad. Here is their journey.`;
    return `<div class="page-head"><div><h1>${esc((window.KF_TEXT && window.KF_TEXT.title) || "Migrations")}</h1><p>${p}</p></div></div>`;
  }

  /* a few headline facts worth reading before pressing play */
  function insights(d, people) {
    const out = [];
    const dec = new Map();
    people.forEach((p) => { const k = Math.floor(p.year / 10) * 10; dec.set(k, (dec.get(k) || 0) + 1); });
    const [bd, bn] = [...dec].sort((a, b) => b[1] - a[1])[0];
    out.push([`${bd}s`, `busiest decade: ${bn} arrive`]);
    const pairs = new Map();
    people.forEach((p) => { const k = `${p.country}→${p.state}`; pairs.set(k, (pairs.get(k) || 0) + 1); });
    const [pk, pn] = [...pairs].sort((a, b) => b[1] - a[1])[0];
    out.push([esc(pk.replace("→", " → ")), `the most travelled route (${pn})`]);
    const first = people[0], last = people[people.length - 1];
    out.push([`${first.year}`, `first: ${esc(first.name)} from ${esc(first.country)}`]);
    out.push([`${last.year}`, `last: ${esc(last.name)} from ${esc(last.country)}`]);
    const non = d.countries.filter(([c]) => c !== "England").reduce((s, [, n]) => s + n, 0);
    if (d.countries.length > 1) out.push([`${d.countries.length}`, `countries of birth; ${non} not from England`]);
    return out;
  }

  /* ---------------------------------------------------------------- the country as it was
     From 1783 the map draws every state and territory as it stood (borders.js, from the Newberry atlas). Before that,
     and if borders.js is missing, this table is used: outlines are today's states, and what each one is called, and
     whether it is a colony, a territory or a state, follows the year. [from, name, kind]: c colony, t territory, s state. */
  const C13 = (from, name, more) => [[from, name, "c"], ...(more || []), [1776, null, "s"]];
  const POLITY = {
    Virginia: C13(1607, "Virginia"), "West Virginia": [[1607, "Virginia", "c"], [1776, "Virginia", "s"], [1863, "West Virginia", "s"]],
    Massachusetts: C13(1620, "Plymouth", [[1630, "Plymouth · Massachusetts Bay", "c"], [1691, "Massachusetts Bay", "c"]]),
    Maine: [[1652, "Maine (Massachusetts)", "c"], [1776, "District of Maine", "s"], [1820, "Maine", "s"]],
    "New Hampshire": C13(1629, "New Hampshire"), Maryland: C13(1634, "Maryland"),
    Connecticut: C13(1636, "Connecticut", [[1638, "Connecticut · New Haven", "c"], [1665, "Connecticut", "c"]]),
    "Rhode Island": C13(1636, "Rhode Island"),
    "New York": C13(1624, "New Netherland", [[1664, "New York", "c"]]),
    "New Jersey": C13(1624, "New Netherland", [[1664, "New Jersey", "c"], [1674, "East & West Jersey", "c"], [1702, "New Jersey", "c"]]),
    Delaware: C13(1638, "New Sweden", [[1655, "New Netherland", "c"], [1664, "Lower Counties on Delaware", "c"]]),
    Pennsylvania: C13(1681, "Pennsylvania"),
    "North Carolina": C13(1663, "Carolina", [[1712, "North Carolina", "c"]]), "South Carolina": C13(1663, "Carolina", [[1712, "South Carolina", "c"]]),
    Georgia: C13(1732, "Georgia"),
    Vermont: [[1777, "Vermont Republic", "t"], [1791, "Vermont", "s"]],
    Kentucky: [[1776, "Kentucky County, Virginia", "t"], [1792, "Kentucky", "s"]],
    Tennessee: [[1777, "Washington District, N.C.", "t"], [1790, "Southwest Territory", "t"], [1796, "Tennessee", "s"]],
    Ohio: [[1787, "Northwest Territory", "t"], [1803, "Ohio", "s"]],
    Indiana: [[1787, "Northwest Territory", "t"], [1800, "Indiana Territory", "t"], [1816, "Indiana", "s"]],
    Illinois: [[1787, "Northwest Territory", "t"], [1800, "Indiana Territory", "t"], [1809, "Illinois Territory", "t"], [1818, "Illinois", "s"]],
    Michigan: [[1787, "Northwest Territory", "t"], [1805, "Michigan Territory", "t"], [1837, "Michigan", "s"]],
    Wisconsin: [[1787, "Northwest Territory", "t"], [1800, "Indiana Territory", "t"], [1809, "Illinois Territory", "t"], [1818, "Michigan Territory", "t"], [1836, "Wisconsin Territory", "t"], [1848, "Wisconsin", "s"]],
    Mississippi: [[1798, "Mississippi Territory", "t"], [1817, "Mississippi", "s"]],
    Alabama: [[1798, "Mississippi Territory", "t"], [1817, "Alabama Territory", "t"], [1819, "Alabama", "s"]],
    Louisiana: [[1804, "Territory of Orleans", "t"], [1812, "Louisiana", "s"]],
    Missouri: [[1805, "Louisiana Territory", "t"], [1812, "Missouri Territory", "t"], [1821, "Missouri", "s"]],
    Arkansas: [[1805, "Louisiana Territory", "t"], [1812, "Missouri Territory", "t"], [1819, "Arkansas Territory", "t"], [1836, "Arkansas", "s"]],
    Florida: [[1822, "Florida Territory", "t"], [1845, "Florida", "s"]],
    Texas: [[1836, "Republic of Texas", "t"], [1845, "Texas", "s"]],
    Iowa: [[1838, "Iowa Territory", "t"], [1846, "Iowa", "s"]], Minnesota: [[1849, "Minnesota Territory", "t"], [1858, "Minnesota", "s"]],
    California: [[1850, "California", "s"]], Oregon: [[1848, "Oregon Territory", "t"], [1859, "Oregon", "s"]],
    Kansas: [[1854, "Kansas Territory", "t"], [1861, "Kansas", "s"]], Nebraska: [[1854, "Nebraska Territory", "t"], [1867, "Nebraska", "s"]],
    Nevada: [[1861, "Nevada Territory", "t"], [1864, "Nevada", "s"]], Colorado: [[1861, "Colorado Territory", "t"], [1876, "Colorado", "s"]],
    "North Dakota": [[1861, "Dakota Territory", "t"], [1889, "North Dakota", "s"]], "South Dakota": [[1861, "Dakota Territory", "t"], [1889, "South Dakota", "s"]],
    Montana: [[1864, "Montana Territory", "t"], [1889, "Montana", "s"]], Washington: [[1853, "Washington Territory", "t"], [1889, "Washington", "s"]],
    Idaho: [[1863, "Idaho Territory", "t"], [1890, "Idaho", "s"]], Wyoming: [[1868, "Wyoming Territory", "t"], [1890, "Wyoming", "s"]],
    Utah: [[1850, "Utah Territory", "t"], [1896, "Utah", "s"]], Oklahoma: [[1834, "Indian Territory", "t"], [1907, "Oklahoma", "s"]],
    "New Mexico": [[1850, "New Mexico Territory", "t"], [1912, "New Mexico", "s"]], Arizona: [[1863, "Arizona Territory", "t"], [1912, "Arizona", "s"]],
    Alaska: [[1867, "Alaska", "t"], [1959, "Alaska", "s"]], Hawaii: [[1900, "Territory of Hawaii", "t"], [1959, "Hawaii", "s"]],
  };
  const LABEL_AT = { Michigan: [-84.7, 43.6], Florida: [-81.6, 28.4], Maryland: [-76.9, 39.35], Virginia: [-78.3, 37.5], Louisiana: [-92.4, 31.0],
    Massachusetts: [-72.0, 42.3], "New York": [-75.4, 42.9], Kentucky: [-85.2, 37.5], Tennessee: [-86.4, 35.8], "North Carolina": [-79.2, 35.6] };
  const polityAt = (name, yr) => {
    const list = POLITY[name];
    let cur = null;
    if (list) for (const e of list) { if (e[0] > yr) break; cur = [e[0], e[1] || (cur && cur[1]) || name, e[2]]; }
    if (cur && cur[2] === "s" && list[0][2] === "c" && cur[0] === 1776) cur[1] = name;      // a colony becomes the state of that name
    return cur;
  };

  /* who else was there: empires' claims (e), Native nations (n) and other names on the land (z). [from, to, name, lon, lat, kind] */
  const REGIONS = [
    [1608, 1763, "New France", -79.5, 46.6, "e"], [1682, 1762, "Louisiana (France)", -91.5, 36.5, "e"], [1762, 1800, "Louisiana (Spain)", -92.5, 36.5, "e"],
    [1565, 1763, "Florida (Spain)", -82.2, 29.6, "e"], [1763, 1783, "East Florida (Britain)", -82.2, 29.6, "e"],
    [1783, 1821, "Florida (Spain)", -82.2, 29.6, "e"], [1740, 1787, "Ohio Country", -82.9, 40.4, "z"], [1763, 1783, "Indian Reserve", -86.5, 37.3, "z"],
    [1600, 1646, "Powhatan", -76.9, 37.6, "n"], [1600, 1676, "Wampanoag", -70.9, 41.75, "n"], [1600, 1737, "Lenape", -75.2, 40.5, "n"],
    [1600, 1784, "Haudenosaunee", -76.6, 42.9, "n"], [1600, 1795, "Shawnee", -83.6, 39.5, "n"], [1600, 1838, "Cherokee", -84.1, 35.2, "n"],
    [1600, 1836, "Muscogee (Creek)", -86.2, 32.6, "n"], [1600, 1831, "Choctaw", -89.5, 32.7, "n"], [1600, 1837, "Chickasaw", -89.0, 34.5, "n"],
    [1600, 1846, "Miami", -85.6, 40.8, "n"],
  ];

  /* the ways people went: [name, opened, eclipsed (or null), kind, label vertex, [lon, lat]...]. Routes run through the
     towns named in the histories; between them the line is only a guide. */
  const ROUTES = [
    ["King's Highway", 1673, 1800, "road", 9, [-71.06, 42.36], [-71.41, 41.82], [-72.1, 41.36], [-72.93, 41.31], [-74.0, 40.71], [-75.16, 39.95], [-75.55, 39.74], [-76.61, 39.29], [-77.05, 38.8], [-77.46, 38.3], [-76.71, 37.27], [-76.61, 36.06], [-77.04, 35.11], [-77.94, 34.23], [-79.28, 33.38], [-79.93, 32.78]],
    ["Great Wagon Road", 1735, 1810, "road", 6, [-75.16, 39.95], [-76.31, 40.04], [-76.73, 39.96], [-77.23, 39.83], [-77.72, 39.64], [-78.16, 39.19], [-79.07, 38.15], [-79.44, 37.78], [-79.94, 37.27], [-79.89, 37.0], [-80.25, 36.09], [-80.47, 35.67], [-80.84, 35.23], [-80.61, 34.25], [-81.97, 33.47]],
    ["Forbes Road", 1758, 1820, "road", 4, [-76.31, 40.04], [-76.88, 40.27], [-77.19, 40.2], [-78.5, 40.02], [-79.24, 40.24], [-80.0, 40.44]],
    ["Proclamation Line of 1763", 1763, 1783, "line", 5, [-74.9, 42.4], [-76.8, 41.5], [-78.4, 40.6], [-79.2, 39.7], [-79.6, 38.6], [-80.3, 37.5], [-81.2, 36.6], [-81.9, 36.0], [-82.6, 35.5], [-83.5, 35.0], [-84.3, 34.5], [-84.9, 33.7], [-84.9, 30.7]],
    ["Wilderness Road", 1775, 1820, "road", 4, [-79.94, 37.27], [-80.94, 36.94], [-81.98, 36.71], [-82.56, 36.55], [-83.67, 36.6], [-84.51, 37.46], [-84.77, 37.65], [-85.76, 38.25]],
    ["Ohio River", 1783, null, "river", 3, [-80.0, 40.44], [-80.72, 40.06], [-81.45, 39.42], [-82.14, 38.84], [-83.0, 38.73], [-83.74, 38.64], [-84.51, 39.1], [-85.76, 38.25], [-87.57, 37.97], [-89.18, 37.0]],
    ["Zane's Trace", 1797, 1830, "road", 2, [-80.72, 40.06], [-82.01, 39.94], [-82.6, 39.71], [-82.98, 39.33], [-83.74, 38.64]],
    ["National Road", 1811, 1860, "road", 6, [-78.76, 39.65], [-79.72, 39.9], [-80.72, 40.06], [-82.01, 39.94], [-83.0, 39.96], [-83.81, 39.92], [-84.89, 39.83], [-86.16, 39.77], [-87.41, 39.47], [-89.09, 38.96]],
    ["Erie Canal", 1825, 1870, "canal", 2, [-73.76, 42.65], [-75.23, 43.1], [-76.15, 43.05], [-77.61, 43.16], [-78.88, 42.89]],
    ["Miami & Erie Canal", 1829, 1870, "canal", 2, [-84.51, 39.1], [-84.19, 39.76], [-84.24, 40.14], [-83.54, 41.65]],
    ["Baltimore & Ohio Railroad", 1830, null, "rail", 2, [-76.61, 39.29], [-77.41, 39.41], [-77.74, 39.32], [-78.76, 39.65], [-80.02, 39.34], [-80.72, 40.06]],
  ];
  ROUTES.forEach((r) => { r.pts = r.slice(5).map(([lon, lat]) => proj(lon, lat)); });
  const ROUTE_STYLE = { road: ["214,182,110", [0.1, 4], 1.8], river: ["120,170,220", [], 1.6], canal: ["120,170,220", [5, 3], 1.4], rail: ["205,205,215", [7, 3, 1, 3], 1.3], line: ["226,120,100", [8, 5], 1.2] };

  /* what was pushing and pulling, a line at a time */
  const CHRONICLE = [
    [1607, "Jamestown is founded; tobacco soon drives Virginia's hunger for labour."],
    [1620, "The Mayflower lands at Plymouth."],
    [1630, "The Great Migration: some twenty thousand Puritans sail for New England."],
    [1634, "Maryland is founded as a refuge for English Catholics."],
    [1642, "Civil war in England slows the Puritan exodus and sends Royalists to Virginia."],
    [1664, "England takes New Netherland; New Amsterdam becomes New York."],
    [1681, "Pennsylvania is chartered; Quakers, then Germans, settle the Delaware valley."],
    [1685, "The Edict of Nantes is revoked; Huguenots flee France."],
    [1709, "War and a bitter winter drive Palatine Germans down the Rhine toward America."],
    [1717, "Ulster Scots begin leaving Ireland in great numbers."],
    [1735, "Settlers take the Great Wagon Road into the Shenandoah and the Carolina backcountry."],
    [1746, "After Culloden, Highland Scots emigrate."],
    [1754, "Britain and France go to war over the Ohio Country."],
    [1763, "Britain wins the West, then forbids settlement beyond the Appalachians."],
    [1775, "The Wilderness Road opens Kentucky through Cumberland Gap; the Revolution begins."],
    [1783, "The Peace of Paris carries the United States to the Mississippi."],
    [1787, "The Northwest Ordinance organises the land north of the Ohio, free of slavery."],
    [1795, "The Treaty of Greenville opens most of Ohio to settlement."],
    [1803, "Ohio becomes a state; the Louisiana Purchase doubles the country."],
    [1811, "The National Road is begun, and the first steamboat descends the Ohio."],
    [1825, "The Erie Canal joins the Hudson to the Great Lakes."],
    [1830, "The Indian Removal Act forces the southern nations west; the first railroads open."],
    [1838, "Steamships begin to cross the Atlantic: weeks under sail become days."],
    [1846, "Famine in Ireland and failed revolutions in Germany send millions across."],
    [1861, "Civil war."],
    [1869, "The transcontinental railroad is completed."],
    [1892, "Ellis Island opens."],
    [1903, "Two Dayton bicycle makers fly at Kitty Hawk."],
    [1924, "Quota laws close the great age of Atlantic migration."],
  ];

  /* ---------------------------------------------------------------- map (a canvas stage)
     Two stories on one timeline: every immigrant's crossing (an arc, origin to landing, ending the year they
     arrive) and the whole direct line (each ancestor's birthplace joined to their child's, ending the year the
     child is born), so the tree gathers generation by generation into the home person's birthplace. */
  let PATHS = null;
  const basePath2D = () => {
    if (PATHS) return PATHS;
    const mk = (list) => {
      const path = new Path2D();
      list.forEach((c) => c.p.forEach((flat) => {
        for (let i = 0; i < flat.length; i += 2) { const [x, y] = proj(flat[i], flat[i + 1]); i ? path.lineTo(x, y) : path.moveTo(x, y); }
        path.closePath();
      }));
      return path;
    };
    const grid = new Path2D();
    for (let lon = -180; lon <= 180; lon += 10) { grid.moveTo(...proj(lon, -60)); grid.lineTo(...proj(lon, 80)); }
    for (let lat = -60; lat <= 80; lat += 10) { grid.moveTo(...proj(-180, lat)); grid.lineTo(...proj(180, lat)); }
    const states = new Map(window.KF_BASEMAP.states.map((s) => {
      let best = null;
      s.p.forEach((flat) => {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let i = 0; i < flat.length; i += 2) { const [x, y] = proj(flat[i], flat[i + 1]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if (!best || (x1 - x0) * (y1 - y0) > best.a) best = { a: (x1 - x0) * (y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, x1 };
      });
      if (LABEL_AT[s.n]) [best.cx, best.cy] = proj(...LABEL_AT[s.n]);
      return [s.n, Object.assign(best, { path: mk([s]) })];
    }));
    // states and territories as they stood, 1783-2000 (borders.js), each with its dates
    const dated = ((window.KF_BORDERS || {}).items || []).map((it) => {
      let best = null;
      it.p.forEach((flat) => {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let i = 0; i < flat.length; i += 2) { const [x, y] = proj(flat[i], flat[i + 1]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if (!best || (x1 - x0) * (y1 - y0) > best.a) best = { a: (x1 - x0) * (y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, x1 };
      });
      if (it.k === "s" && LABEL_AT[it.n] && it.b > 1900) [best.cx, best.cy] = proj(...LABEL_AT[it.n]);
      return Object.assign(best, { name: it.n, kind: it.k === "o" ? "t" : it.k, from: it.a, to: it.b, path: mk([it]) });
    });
    return (PATHS = { land: mk(window.KF_BASEMAP.countries), states, dated, datedFrom: dated.length ? Math.min(...dated.map((g) => g.from)) : Infinity, grid });
  };
  const SPRITES = {};
  const sprite = (rgbStr) => SPRITES[rgbStr] || (SPRITES[rgbStr] = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.14, `rgba(${rgbStr},.9)`);
    gr.addColorStop(0.45, `rgba(${rgbStr},.22)`); gr.addColorStop(1, `rgba(${rgbStr},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  })());
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
  // the stretch [a, b] of a quadratic curve, as its own quadratic: [x0, y0, qx, qy, x1, y1]
  const sub = (P, Q, R, a, b) => {
    const f = (u, v, i) => (1 - u) * (1 - v) * P[i] + ((1 - u) * v + u * (1 - v)) * Q[i] + u * v * R[i];
    return [f(a, a, 0), f(a, a, 1), f(a, b, 0), f(a, b, 1), f(b, b, 0), f(b, b, 1)];
  };
  const bits = (a) => 32 - Math.clz32(a);
  const sideOf = (a) => { if (!a || a < 2) return null; return a < 3 << (bits(a) - 2) ? "paternal" : "maternal"; };

  /* one true line about a crossing, from the records */
  function journeyNote(p) {
    const age = p.born && p.year - p.born, okAge = age > 0 && age < 100;
    const from = p.origin.region || p.country, to = placeLabel(p.landing);
    let a;
    if (p.year_how === "arrived") a = okAge ? (age < 16 ? `Crossed as a child of ${age}` : `Crossed the Atlantic at ${age}`) : `Crossed the Atlantic in ${p.year}`;
    else if (p.year_how === "by") a = `Left ${from} and was in ${to} by ${p.year}${okAge ? `, aged about ${age}` : ""}`;
    else a = `Thought to have crossed around ${p.year}`;
    const diedHere = p.died && p.died >= p.year && p.trail.some((t) => t.tag === "DEAT" || t.tag === "BURI");
    const yrs = diedHere ? p.died - p.year : 0;
    return a + (yrs > 0 ? `; lived ${yrs} more ${yrs === 1 ? "year" : "years"} in America.` : ".");
  }

  function mapView(host, d, people, byId, visible) {
    const FIN = 10;                                  // the gathering at the end, in timeline years (10 seconds at 1x)
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const P = basePath2D();

    /* ---- the cast: immigrants (arcs), direct ancestors (nodes) and the lines between generations (edges) */
    people.forEach((p) => {
      p.t1 = p.year + hash(p.id * 3 + 1) * 0.95;                 // each arrival lands at its own moment in the year
      p.t0 = p.t1 - (4 + hash(p.id * 5 + 2) * 3);
      p.rgb = rgb(glow(p.country));
      p.g = p.ahnen ? bits(p.ahnen) : null;
    });
    const nodes = new Map();
    (d.descent || []).forEach((n) => {
      const imm = byId.get(n.id);
      const pt = n.a === 1 || n.private ? proj(n.lon, n.lat) : imm ? imm.o : proj(...jitter(n, n.id * 13 + 5, n.precision));
      nodes.set(n.a, Object.assign(n, { pt, imm, g: bits(n.a), side: sideOf(n.a) }));
    });
    // a private home person has no birth year: the film then ends just after the last public date
    const lastKnown = Math.max(...[...nodes.values()].flatMap((n) => [n.born, n.died]).filter(Boolean), ...people.map((p) => p.year));
    nodes.forEach((n) => { n.est = n.born || (n.to ? nodes.get(n.to).est - 28 : n.private ? lastKnown + 2 : new Date().getFullYear() - 30); });
    const home = nodes.get(1) || null;
    const edges = [];
    nodes.forEach((n) => {
      if (!n.to) return;
      const t = nodes.get(n.to), fromLand = n.imm && t.country === "United States";
      const a = fromLand ? n.imm.l : n.pt, b = t.pt, dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.hypot(dx, dy) < 0.3) return;
      const bow = (hash(n.a) - 0.5) * 0.3;
      let t1 = t.est + hash(n.a * 3 + 1) * 0.9;
      if (fromLand) t1 = Math.max(t1, n.imm.t1 + 1);
      edges.push({ n, t, a, q: [(a[0] + b[0]) / 2 - dy * bow, (a[1] + b[1]) / 2 + dx * bow], b, t1, t0: t1 - (5 + hash(n.a * 5 + 2) * 4), g: n.g });
    });
    // the last leg of each life: from where their child on the line was born to where they died
    const US = "United States", lives = [];
    nodes.forEach((n) => {
      if (!n.death || !n.to || nodes.get(n.to).private) return;      // no last leg drawn from a private birthplace
      const t = nodes.get(n.to), b = proj(...jitter(n.death, n.id * 17 + 9, n.death.precision));
      const a = n.imm && n.death.country === US && t.country !== US ? n.imm.l : t.pt, dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.hypot(dx, dy) < 0.3) return;
      const bow = (hash(n.a * 9 + 4) - 0.5) * 0.3;
      const t1 = Math.max(n.died || n.est + 65, t.est + 1) + hash(n.a * 3 + 2) * 0.9;
      lives.push({ n, t, a, q: [(a[0] + b[0]) / 2 - dy * bow, (a[1] + b[1]) / 2 + dx * bow], b, t1, t0: Math.max(t.est + 0.5, t1 - 8) });
    });
    // names to show as people arrive: at a landing, and wherever a move within America crosses a state line
    const caps = people.map((p) => ({ t: p.t1, pt: p.l, name: p.name, sub: `${p.origin.region || p.country}, ${p.year}`, rgb: p.rgb, on: () => p.vis }));
    edges.forEach((e) => { if (!e.n.private && !e.t.private && e.n.country === US && e.t.country === US && e.n.region !== e.t.region) caps.push({ t: e.t1, pt: e.b, name: e.n.name, sub: `${e.n.region} → ${e.t.region}, by ${Math.floor(e.t.est)}`, rgb: "233,223,199", on: () => e.vis }); });
    lives.forEach((l) => { if (!l.t.private && l.n.death.country === US && l.t.country === US && l.n.death.region !== l.t.region) caps.push({ t: l.t1, pt: l.b, name: l.n.name, sub: `${l.t.region} → ${l.n.death.region}, died ${l.n.died || "there"}`, rgb: "170,190,220", on: () => l.n.vis }); });
    caps.sort((a, b) => a.t - b.t);
    const maxG = Math.max(2, ...edges.map((e) => e.g), ...people.map((p) => p.g || 0));
    const firsts = [...people.map((p) => p.t0), ...edges.map((e) => e.t0)];
    const yStart = Math.floor((Math.min(...firsts) - 4) / 10) * 10;
    const lastArr = people[people.length - 1].year;
    const yEnd = home ? Math.max(home.est, lastArr + 1) : lastArr + 5;
    const fin = home ? FIN : 0, yMax = yEnd + fin;
    if (st.year == null || st.year < yStart || st.year > yMax) st.year = yStart;
    const sorted = people.map((p) => p.year).sort((a, b) => a - b);
    const yMost = sorted[Math.floor(sorted.length * 0.6)];       // most have crossed: the story turns to America

    // pacing: linger where much happens, move on where little does (about 85 seconds end to end at 1x)
    const nDec = Math.max(1, Math.ceil((yEnd - yStart) / 10)), per = new Array(nDec).fill(0);
    const di = (y) => Math.max(0, Math.min(nDec - 1, Math.floor((y - yStart) / 10)));
    people.forEach((p) => per[di(p.t1)]++);
    edges.forEach((e) => (per[di(e.t1)] += 0.5));
    const meanN = per.reduce((s, n) => s + n, 0) / nDec || 1, wts = per.map((n) => 0.3 + n / meanN), wSum = wts.reduce((s, n) => s + n, 0);
    const rateAt = (y) => (y >= yEnd ? 1 : 10 / ((85 * wts[di(y)]) / wSum));        // timeline years per second

    const homePlace = !home || home.private ? "" : ((home.place || "").split(",")[0].trim() === home.region || home.precision === "state" ? home.region
      : `${(home.place || "").split(",")[0].trim()}, ${home.region}`);
    host.innerHTML = `<div class="mig-stage" id="mg-stage">
      <canvas id="mg-cv" role="img" aria-label="Map of immigrant journeys and lines of descent up to the year shown"></canvas>
      <div class="mig-vig"></div>
      <div class="mig-legend" id="mg-legend"></div>
      <div class="mig-tools">
        <button id="mg-follow" hidden>Recentre</button>
        <button id="mg-full">Full screen</button>
        <button data-mzi="1" aria-label="Zoom in">+</button><button data-mzi="-1" aria-label="Zoom out">−</button>
      </div>
      <aside class="mig-card" id="mg-side" hidden></aside>
      ${home ? `<div class="mig-finale" id="mg-fin"><b>${esc(home.name)}</b>${homePlace || home.born ? `<span>${esc(homePlace)}${home.born ? `, ${home.born}` : ""}</span>` : ""}</div>` : ""}
      <div class="mig-tip" id="mg-tip" hidden></div>
      <div class="mig-time">
        <div class="mig-year"><b id="mg-yr"></b><span id="mg-cnt"></span><i id="mg-chron"></i></div>
        <div class="mig-controls">
          <button class="mig-play" id="mg-play" aria-label="Play">▶</button>
          <div class="mig-scrubwrap">
            <div class="mig-scrub"><svg id="mg-hist" preserveAspectRatio="none"></svg><input type="range" id="mg-range" min="${yStart}" max="${yMax}" step="0.5" value="${st.year}" aria-label="Year"></div>
            <div class="mig-ticks" id="mg-ticks"></div>
          </div>
          <div class="mig-speed" role="group" aria-label="Speed">${[[0.5, "½×"], [1, "1×"], [3, "3×"]].map(([k, l]) => `<button data-sp="${k}" class="${st.speed === k ? "on" : ""}">${l}</button>`).join("")}</div>
        </div>
      </div>
    </div>`;
    const stage = $("#mg-stage"), cv = $("#mg-cv"), ctx = cv.getContext("2d"), tipEl = $("#mg-tip");
    const base = document.createElement("canvas"), bctx = base.getContext("2d");
    const M = 96;                                    // the cached basemap is this much larger than the stage, each side
    let W = 0, H = 0, dpr = 1, baseCam = null, baseKey = null, ver = 0, barH = 136;
    const cam = { cx: 0, cy: 0, z: 1, manual: false, set: false };

    /* ---- camera */
    const fit = (box) => {
      const [x, y, w, h] = rect(box), pad = 96;                  // the time bar covers the bottom of the stage
      const z = Math.min(W / w, Math.max(120, H - pad) / h);
      return { cx: x + w / 2, cy: y + h / 2 + pad / 2 / z, z };
    };
    const mix = (a, b, k) => ({ cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, z: a.z * (b.z / a.z) ** k });
    const target = (yr, now) => {
      const k = smooth((yr - yMost) / 45);
      let t = mix(fit(VIEWS.atlantic), fit(VIEWS.america), k);
      if (fin && yr > yEnd) t = mix(t, fit([home.lon - 13, home.lat - 7, home.lon + 13, home.lat + 7]), ease(clamp01((yr - yEnd) / fin)));
      if (!calm) { t.cx += (Math.sin(now / 9000) * 10) / t.z; t.cy += (Math.cos(now / 7000) * 6) / t.z; }
      return t;
    };
    const sx = (x) => (x - cam.cx) * cam.z + W / 2, sy = (y) => (y - cam.cy) * cam.z + H / 2;
    const zoomAt = (f, px, py) => {
      const z = Math.max(0.25, Math.min(60, cam.z * f)), mx = cam.cx + (px - W / 2) / cam.z, my = cam.cy + (py - H / 2) / cam.z;
      cam.z = z; cam.cx = mx - (px - W / 2) / z; cam.cy = my - (py - H / 2) / z;
      cam.manual = true; $("#mg-follow").hidden = false;
    };

    const renderBase = (yr, f, selP) => {
      base.width = (W + 2 * M) * dpr; base.height = (H + 2 * M) * dpr;
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sea = bctx.createLinearGradient(0, 0, 0, H + 2 * M);
      sea.addColorStop(0, "#0A1322"); sea.addColorStop(1, "#0D1B2F");
      bctx.fillStyle = sea; bctx.fillRect(0, 0, W + 2 * M, H + 2 * M);
      bctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (W / 2 + M - cam.cx * cam.z), dpr * (H / 2 + M - cam.cy * cam.z));
      bctx.lineWidth = 1 / cam.z; bctx.strokeStyle = "rgba(233,223,199,.035)"; bctx.stroke(P.grid);
      bctx.fillStyle = "#16263C"; bctx.fill(P.land, "evenodd");
      bctx.lineJoin = "round"; bctx.strokeStyle = "rgba(214,182,110,.2)"; bctx.stroke(P.land);
      // the country as it was this year: from 1783 each state and territory as it stood; before that the colonies,
      // on today's outlines
      const px = 1 / cam.z, kinds = { c: [new Path2D(), "214,182,110", 0.07, 0.4, []], t: [new Path2D(), "233,223,199", 0.025, 0.24, [3, 3]], s: [new Path2D(), "150,180,225", 0.07, 0.34, []], u: [new Path2D(), "233,223,199", 0.012, 0.14, [1, 4]] };
      const groups = new Map(), asItStood = yr + 0.999 >= P.datedFrom;
      if (asItStood) P.dated.forEach((g) => {
        if (g.from > yr + 0.999 || g.to <= yr + 0.999) return;      // the borders at the close of the year on screen
        kinds[g.kind][0].addPath(g.path);
        groups.set(g.name + g.kind + g.cx, { label: g.name, kind: g.kind, n: 1, cx: g.cx, cy: g.cy, x0: g.x0, x1: g.x1 });
      });
      else P.states.forEach((g, name) => {
        const pol = polityAt(name, yr);
        if (!pol) return;
        kinds[pol[2]][0].addPath(g.path);
        const k = pol[1] + pol[2];
        let grp = groups.get(k);
        if (!grp) groups.set(k, (grp = { label: pol[1], kind: pol[2], n: 0, cx: 0, cy: 0, x0: 1e9, x1: -1e9 }));
        grp.n++; grp.cx += g.cx; grp.cy += g.cy; grp.x0 = Math.min(grp.x0, g.x0); grp.x1 = Math.max(grp.x1, g.x1);
      });
      Object.values(kinds).forEach(([path, c, fill, line, dash]) => {
        bctx.fillStyle = `rgba(${c},${fill})`; bctx.fill(path, "evenodd");
        bctx.setLineDash(dash.map((v) => v * px)); bctx.lineWidth = 0.8 * px; bctx.strokeStyle = `rgba(${c},${line})`; bctx.stroke(path);
      });
      // the ways people went
      bctx.lineCap = "round";
      const routeA = (r) => smooth((yr - r[1] + 4) / 8) * (r[2] && yr > r[2] ? (r[3] === "line" ? smooth((r[2] + 6 - yr) / 6) : Math.max(0.3, 1 - (yr - r[2]) / 50)) : 1);
      ROUTES.forEach((r) => {
        const a = routeA(r);
        if (a <= 0) return;
        const [c, dash, w] = ROUTE_STYLE[r[3]], pts = r.pts;
        bctx.beginPath(); bctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) bctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
        bctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        bctx.setLineDash(dash.map((v) => v * px)); bctx.lineWidth = w * px; bctx.strokeStyle = `rgba(${c},${(0.6 * a).toFixed(3)})`; bctx.stroke();
      });
      bctx.setLineDash([]);
      // names on the land, where there is room for them
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bx = (x) => (x - cam.cx) * cam.z + W / 2 + M, by = (y) => (y - cam.cy) * cam.z + H / 2 + M;
      bctx.textAlign = "center"; bctx.textBaseline = "middle";
      bctx.font = `600 10px ${SANS}`;
      if ("letterSpacing" in bctx) bctx.letterSpacing = "1.5px";
      groups.forEach((g) => {
        const text = g.label.toUpperCase();
        if (bctx.measureText(text).width + 8 > (g.x1 - g.x0) * cam.z) return;
        bctx.fillStyle = `rgba(${kinds[g.kind][1]},${g.kind === "u" ? 0.3 : g.kind === "t" ? 0.4 : 0.55})`;
        bctx.fillText(text, bx(g.cx / g.n), by(g.cy / g.n));
      });
      if ("letterSpacing" in bctx) bctx.letterSpacing = "0px";
      if (cam.z >= 1.5) REGIONS.forEach(([from, to, name, lon, lat, kind]) => {
        const a = smooth((yr - from + 3) / 6) * smooth((to + 3 - yr) / 6);
        if (a <= 0) return;
        const [x, y] = proj(lon, lat);
        bctx.font = `italic ${kind === "n" ? 12 : 14}px ${SERIF}`;
        bctx.fillStyle = `rgba(${kind === "n" ? "150,200,175" : kind === "e" ? "226,150,130" : "233,223,199"},${(0.6 * a).toFixed(3)})`;
        bctx.fillText(name, bx(x), by(y));
      });
      if (cam.z >= 2.2) ROUTES.forEach((r) => {
        const a = routeA(r);
        if (a <= 0) return;
        const pt = r.pts[r[4]];
        bctx.font = `italic 11px ${SERIF}`; bctx.fillStyle = `rgba(${ROUTE_STYLE[r[3]][0]},${(0.85 * a).toFixed(3)})`;
        bctx.fillText(r[0], bx(pt[0]), by(pt[1]) - 9);
      });
      bctx.textAlign = "start";
      bctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (W / 2 + M - cam.cx * cam.z), dpr * (H / 2 + M - cam.cy * cam.z));
      settled(bctx, yr, f, selP);
      baseCam = { cx: cam.cx, cy: cam.cy, z: cam.z };
    };

    /* ---- who is on stage (filters) */
    function refresh() {
      const filtered = st.countries.size || st.stateFilter;
      const marks = new Set(), path = new Set();
      people.forEach((p) => { p.vis = visible(p); if (filtered && p.vis && p.ahnen) { marks.add(p.ahnen); for (let x = p.ahnen; x >= 1; x >>= 1) path.add(x); } });
      const kept = (a) => { if (path.has(a)) return true; for (let x = a; x >= 1; x >>= 1) if (marks.has(x)) return true; return false; };
      nodes.forEach((n) => { n.vis = (st.side === "all" || n.a === 1 || n.side === st.side) && (!filtered || kept(n.a)); });
      edges.forEach((e) => { e.vis = e.n.vis && e.t.vis; });
      lives.forEach((l) => { l.vis = l.n.vis; });
      ver++;
      hist();
    }

    /* ---- the decade histogram behind the slider */
    const decades = [];
    for (let y = yStart; y < yEnd; y += 10) decades.push(y);
    function hist() {
      const counts = decades.map((dy) => { const m = new Map(); people.forEach((p) => { if (p.vis && p.year >= dy && p.year < dy + 10) m.set(p.country, (m.get(p.country) || 0) + 1); }); return m; });
      const max = Math.max(1, ...counts.map((m) => [...m.values()].reduce((s, n) => s + n, 0)));
      $("#mg-hist").setAttribute("viewBox", `0 0 ${yMax - yStart} 100`);
      $("#mg-hist").innerHTML = counts.map((m, i) => { let yy = 100; return [...m].sort((a, b) => b[1] - a[1]).map(([c, n]) => { const hh = (n / max) * 92; yy -= hh; return `<rect x="${i * 10 + 1}" y="${yy}" width="8" height="${hh}" fill="${glow(c)}"/>`; }).join(""); }).join("")
        + `<line id="mg-head" x1="0" x2="0" y1="0" y2="100" class="mig-head"/>`;
      const step = yMax - yStart > 200 ? 50 : 20;
      $("#mg-ticks").innerHTML = decades.filter((y) => y % step === 0).map((y) => `<span style="left:${((y - yStart) / (yMax - yStart)) * 100}%">${y}</span>`).join("");
    }

    /* ---- one frame */
    const dust = calm ? [] : Array.from({ length: 70 }, (_, i) => ({ x: hash(i * 11 + 1), y: hash(i * 17 + 2), vx: (hash(i * 23 + 3) - 0.3) * 0.006, vy: (hash(i * 29 + 4) - 0.5) * 0.003, r: 0.6 + hash(i * 31 + 5) * 1.1, a: 0.05 + hash(i * 37 + 6) * 0.16, ph: hash(i * 41 + 7) * 6.28 }));
    const GOLD = "233,223,199", SUN = "244,205,120", COOL = "170,190,220";
    let hov = null, shownYear = null, shownCount = null, shownChron = null;
    /* everything that has finished moving, drawn once into the cached background (thousands of long glowing lines
       are too much to repaint every frame): lines of descent, last legs, crossings and the ancestors' points */
    function settled(c, yr, f, selP) {
      const dim = selP ? 0.22 : 1, boost = 1 + f * 1.4, px = 1 / cam.z;
      const run = (list, young, old, wYoung, wOld, rgbStr, aYoung, aOld) => {
        const recent = new Path2D(), past = new Path2D();
        list.forEach((e) => { if (!e.vis || yr < e.t1) return; const t = yr - e.t1 < young ? recent : past; t.moveTo(e.a[0], e.a[1]); t.quadraticCurveTo(e.q[0], e.q[1], e.b[0], e.b[1]); });
        c.strokeStyle = `rgba(${rgbStr},${Math.min(1, aOld).toFixed(3)})`; c.lineWidth = wOld * px; c.stroke(past);
        c.strokeStyle = `rgba(${rgbStr},${Math.min(1, aYoung).toFixed(3)})`; c.lineWidth = wYoung * px; c.stroke(recent);
      };
      c.globalCompositeOperation = "lighter"; c.lineCap = "round";
      run(edges, 25, 0, 0.9, 0.7, GOLD, 0.2 * dim, 0.055 * dim * boost);
      run(lives, 20, 0, 0.8, 0.7, COOL, 0.22 * dim, 0.05 * dim);
      const buckets = new Map();
      people.forEach((p) => {
        if (!p.vis || yr < p.t1 || p === selP) return;
        const age = yr - p.t1, b = age < 8 ? 0 : age < 30 ? 1 : 2, key = p.rgb + b;
        let bk = buckets.get(key);
        if (!bk) buckets.set(key, (bk = { c: p.rgb, b, path: new Path2D() }));
        bk.path.moveTo(p.o[0], p.o[1]); bk.path.quadraticCurveTo(p.q[0], p.q[1], p.l[0], p.l[1]);
      });
      buckets.forEach((bk) => {
        c.strokeStyle = `rgba(${bk.c},${Math.min(1, [0.55, 0.32, 0.13][bk.b] * dim * (bk.b === 2 ? boost : 1)).toFixed(3)})`;
        c.lineWidth = [1.4, 1.1, 0.8][bk.b] * px; c.stroke(bk.path);
      });
      const recent = new Path2D(), past = new Path2D();
      nodes.forEach((n) => {
        if (!n.vis || n.est > yr || n.a === 1) return;
        const young = yr - n.est < 12, r = (young ? 1 : 0.65) * px;
        (young ? recent : past).rect(n.pt[0] - r, n.pt[1] - r, 2 * r, 2 * r);
      });
      c.fillStyle = `rgba(${GOLD},${(0.34 * dim).toFixed(3)})`; c.fill(past);
      c.fillStyle = `rgba(${GOLD},${(0.9 * dim).toFixed(3)})`; c.fill(recent);
      c.globalCompositeOperation = "source-over";
    }

    function draw(now, dt) {
      const yr = Math.min(st.year, yEnd), f = fin ? clamp01((st.year - yEnd) / fin) : 0;
      const selP = st.sel && byId.get(st.sel), dim = selP ? 0.22 : 1, px = 1 / cam.z;
      // the background (map, history and everything settled) comes from the cache while the camera only drifts or
      // eases: it is redrawn when the year, the filters or the selection change, or the view has moved too far
      const key = `${Math.floor(yr)}|${Math.round(f * 40)}|${st.sel}|${ver}`;
      let sc = baseCam ? cam.z / baseCam.z : 1, ox = 0, oy = 0;
      const place = () => { sc = cam.z / baseCam.z; ox = (baseCam.cx - cam.cx) * cam.z + W / 2 - (W / 2 + M) * sc; oy = (baseCam.cy - cam.cy) * cam.z + H / 2 - (H / 2 + M) * sc; };
      if (baseCam) place();
      if (!baseCam || baseKey !== key || Math.abs(Math.log(sc)) > 0.05 || ox > 0 || oy > 0 || ox + (W + 2 * M) * sc < W || oy + (H + 2 * M) * sc < H) { renderBase(yr, f, selP); baseKey = key; place(); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.drawImage(base, ox, oy, (W + 2 * M) * sc, (H + 2 * M) * sc);

      const glows = [];                                          // [screen x, screen y, size, alpha, rgb]
      const head = (x, y, size, a, c) => glows.push([sx(x), sy(y), size, a, c]);
      ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (W / 2 - cam.cx * cam.z), dpr * (H / 2 - cam.cy * cam.z));
      ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      const stroke = (c, a, w) => { ctx.strokeStyle = `rgba(${c},${Math.min(1, a).toFixed(3)})`; ctx.lineWidth = w * px; ctx.stroke(); };
      const wave = (it, isArc, c) => {                           // the gathering: light runs down every line, oldest first
        const u = (f - (1 - ((it.g || maxG) + (isArc ? 0.5 : 0)) / (maxG + 0.5)) * 0.72) / 0.22;
        if (u <= 0 || u >= 1) return;
        const s = isArc ? sub(it.o, it.q, it.l, 0, ease(u)) : sub(it.a, it.q, it.b, 0, ease(u));
        head(s[4], s[5], 12, Math.sin(Math.PI * u) * 0.9, c);
      };

      // lines of descent being drawn now
      edges.forEach((e) => {
        if (!e.vis || yr < e.t0) return;
        if (yr >= e.t1) { if (f) wave(e, false, SUN); return; }
        const k = ease((yr - e.t0) / (e.t1 - e.t0)), s = sub(e.a, e.q, e.b, 0, k);
        ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.quadraticCurveTo(s[2], s[3], s[4], s[5]);
        stroke(GOLD, 0.5 * dim, 1);
        head(s[4], s[5], 7, 0.7 * dim, GOLD);
      });

      // the last leg of each life, cooler and quieter than the line that carries on
      ctx.beginPath();
      lives.forEach((l) => {
        if (!l.vis || yr < l.t0 || yr >= l.t1) return;
        const k = ease((yr - l.t0) / (l.t1 - l.t0)), s = sub(l.a, l.q, l.b, 0, k);
        ctx.moveTo(s[0], s[1]); ctx.quadraticCurveTo(s[2], s[3], s[4], s[5]);
        head(s[4], s[5], 5, 0.55 * (1 - k * 0.6) * dim, COOL);
      });
      stroke(COOL, 0.3 * dim, 0.8);

      // crossings under way, with a comet head; a ripple where one has just landed
      const sailing = [];
      let crossed = 0;
      people.forEach((p) => {
        if (!p.vis || yr < p.t0) return;
        if (yr < p.t1) { sailing.push(p); return; }
        crossed++;
        if (p === selP) return;
        const age = yr - p.t1;
        if (age < 2.5) { ctx.beginPath(); ctx.arc(p.l[0], p.l[1], (3 + age * 7) * px, 0, 6.283); stroke(p.rgb, (1 - age / 2.5) * 0.7 * dim, 1); }
        if (f) wave(p, true, p.rgb);
      });
      sailing.forEach((p) => {
        const k = ease((yr - p.t0) / (p.t1 - p.t0)), a = p === selP ? 1 : dim;
        let s = sub(p.o, p.q, p.l, 0, k);
        ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.quadraticCurveTo(s[2], s[3], s[4], s[5]); stroke(p.rgb, 0.4 * a, 1.1);
        s = sub(p.o, p.q, p.l, Math.max(0, k - 0.16), k);
        ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.quadraticCurveTo(s[2], s[3], s[4], s[5]); stroke(p.rgb, 0.95 * a, 1.9);
        head(s[4], s[5], 16, 0.95 * a, p.rgb);
        if (!calm) for (let i = 1; i <= 3; i++) { const t = sub(p.o, p.q, p.l, 0, Math.max(0, k - i * 0.035 - 0.01 * Math.sin(now / 300 + p.id + i))); head(t[4], t[5], 6, (0.5 - i * 0.12) * a, p.rgb); }
      });
      const lit = hov && hov.p && hov.p !== selP ? hov.p : null;
      [selP, lit].forEach((p) => {
        if (!p || !p.vis || yr < p.t1) return;
        ctx.beginPath(); ctx.moveTo(p.o[0], p.o[1]); ctx.quadraticCurveTo(p.q[0], p.q[1], p.l[0], p.l[1]); stroke(p.rgb, 1, 2.4);
        head(p.l[0], p.l[1], 12, 0.8, p.rgb);
      });
      if (selP && selP.vis && yr >= selP.t1 && selP.moves.length > 1) {       // their later moves in America
        ctx.setLineDash([3 * px, 4 * px]); ctx.beginPath(); ctx.moveTo(selP.moves[0][0], selP.moves[0][1]);
        for (let i = 1; i < selP.moves.length; i++) { const m = selP.moves[i]; if (m.year && m.year > yr) break; ctx.lineTo(m[0], m[1]); }
        stroke(selP.rgb, 0.8, 1.2); ctx.setLineDash([]);
      }
      if (hov && hov.n) head(hov.n.pt[0], hov.n.pt[1], 12, 0.9, GOLD);

      // home: a quiet ember that waits, then takes everything in
      if (home) {
        const b = smooth((f - 0.68) / 0.32), born = yr >= home.est ? 1 : 0;
        head(home.pt[0], home.pt[1], 9 + 5 * born + 150 * b, (0.28 + 0.1 * Math.sin(now / 1300)) * (1 + born) + b * 0.5, SUN);
        if (b > 0) for (let i = 0; i < 3; i++) {
          const u = (now / 3200 + i / 3) % 1;
          ctx.beginPath(); ctx.arc(home.pt[0], home.pt[1], (8 + u * 70) * px, 0, 6.283); stroke(SUN, (1 - u) * 0.35 * b, 1);
        }
      }

      // glows, fog and dust in screen space
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      glows.forEach(([x, y, size, a, c]) => { if (a <= 0 || x < -size || y < -size || x > W + size || y > H + size) return; ctx.globalAlpha = Math.min(1, a); ctx.drawImage(sprite(c), x - size, y - size, size * 2, size * 2); });
      if (!calm) {
        const fog = sprite("120,150,190");
        ctx.globalAlpha = 0.05;
        for (let i = 0; i < 2; i++) { const r = Math.max(W, H) * 0.55, fx = W * (0.5 + 0.45 * Math.sin(now / 41000 + i * 2.4)), fy = H * (0.45 + 0.3 * Math.cos(now / 53000 + i * 1.7)); ctx.drawImage(fog, fx - r, fy - r, 2 * r, 2 * r); }
        dust.forEach((p) => {
          p.x = (p.x + p.vx * dt + 1) % 1; p.y = (p.y + p.vy * dt + 1) % 1;
          ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(now / 1700 + p.ph));
          ctx.fillStyle = `rgb(${GOLD})`; ctx.fillRect(p.x * W, p.y * H, p.r, p.r);
        });
      }

      // the names of those just landing
      ctx.globalCompositeOperation = "source-over";
      if (!selP && !f) {
        const boxes = [];
        ctx.textBaseline = "middle";
        for (const p of caps) {
          if (boxes.length >= 9) break;
          const age = yr - p.t;
          if (age < -0.4) break;
          if (age > 3.6 || !p.on()) continue;
          const a = smooth((age + 0.4) / 0.6) * smooth((3.6 - age) / 1.4);
          ctx.font = `italic 15px ${SERIF}`;
          const wName = ctx.measureText(p.name).width;
          ctx.font = `11px ${SANS}`;
          const w = Math.max(wName, ctx.measureText(p.sub).width, 40), x0 = sx(p.pt[0]), y0 = sy(p.pt[1]);
          if (x0 < -20 || x0 > W + 20 || y0 < 0 || y0 > H) continue;
          // west of the place, clear of the incoming lines; step down the page past names already there
          const bx = x0 - 16 - w > 8 ? x0 - 16 - w : x0 + 16;
          let box = null;
          for (let i = 0; i < 6 && !box; i++) {
            const yy = y0 + 8 + i * 36, b = [bx, yy - 18, bx + w, yy + 18];
            if (yy > 24 && yy < H - barH && !boxes.some((o) => b[0] < o[2] + 8 && b[2] + 8 > o[0] && b[1] < o[3] && b[3] > o[1])) box = b;
          }
          if (!box) continue;
          const y1 = box[1] + 18;
          boxes.push(box);
          ctx.globalAlpha = a; ctx.fillStyle = "#F1E7CF";
          ctx.shadowColor = "rgba(5,9,16,.9)"; ctx.shadowBlur = 6;
          ctx.font = `italic 15px ${SERIF}`;
          ctx.fillText(p.name, bx, y1 - 7);
          ctx.font = `11px ${SANS}`; ctx.fillStyle = `rgb(${p.rgb})`;
          ctx.fillText(p.sub, bx, y1 + 10);
          ctx.shadowBlur = 0;
        }
      }
      ctx.globalAlpha = 1;

      // the page furniture
      const y = Math.floor(yr);
      if (y !== shownYear) { shownYear = y; $("#mg-yr").textContent = y; }
      if (crossed !== shownCount) { shownCount = crossed; $("#mg-cnt").textContent = `${fmt(crossed)} arrived`; }
      let ci = -1;
      for (let i = 0; i < CHRONICLE.length && CHRONICLE[i][0] <= yr; i++) ci = i;
      const ce = $("#mg-chron"), ca = ci < 0 || f ? 0 : smooth((yr - CHRONICLE[ci][0]) / 0.6) * smooth((CHRONICLE[ci][0] + 14 - yr) / 3);
      if (ci !== shownChron) { shownChron = ci; ce.textContent = ci < 0 ? "" : CHRONICLE[ci][1]; }
      ce.style.opacity = ca.toFixed(2);
      const hd = $("#mg-head");
      if (hd) { hd.setAttribute("x1", st.year - yStart); hd.setAttribute("x2", st.year - yStart); }
      const rg = $("#mg-range");
      if (document.activeElement !== rg || st.playing) rg.value = st.year;
      const fe = $("#mg-fin");
      if (fe) { fe.style.opacity = smooth((f - 0.72) / 0.25); fe.style.left = `${sx(home.pt[0])}px`; fe.style.top = `${sy(home.pt[1])}px`; }
    }

    /* ---- the loop: ambient motion always, the story when playing */
    let raf = 0, last = 0, alive = true;
    const frame = (now) => {
      if (!alive || !cv.isConnected) return;
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      if (st.playing) {
        st.year = Math.min(yMax, st.year + dt * rateAt(st.year) * st.speed);
        if (st.year >= yMax) setPlay(false);
      }
      if (W && H) {
        if (!cam.manual) {
          const t = target(st.year, now), k = cam.set ? 1 - Math.exp(-dt * 1.4) : 1;
          cam.cx += (t.cx - cam.cx) * k; cam.cy += (t.cy - cam.cy) * k; cam.z *= (t.z / cam.z) ** k;
          if (Math.abs(Math.log(t.z / cam.z)) < 2e-4) cam.z = t.z;
          cam.set = true;
        }
        draw(now, dt);
      }
      raf = requestAnimationFrame(frame);
    };
    const setPlay = (on) => {
      st.playing = on;
      const b = $("#mg-play");
      if (!b) return;
      if (on && st.year >= yMax) { st.year = yStart; cam.manual = false; $("#mg-follow").hidden = true; }
      b.textContent = on ? "❚❚" : st.year >= yMax ? "↺" : "▶";
      b.setAttribute("aria-label", on ? "Pause" : st.year >= yMax ? "Replay" : "Play");
    };

    /* ---- pointer: pan, zoom, hover, select */
    const tip = (html, ev) => {
      if (!html) { tipEl.hidden = true; return; }
      tipEl.innerHTML = html; tipEl.hidden = false;
      const b = stage.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top;
      tipEl.style.left = `${Math.min(x + 16, W - tipEl.offsetWidth - 8)}px`;
      tipEl.style.top = `${Math.min(y + 16, H - tipEl.offsetHeight - 8)}px`;
    };
    const origin = (p) => (p.origin.region ? `${p.origin.region}, ${p.country}` : p.country);
    const hit = (ev) => {
      const b = cv.getBoundingClientRect(), mx = ev.clientX - b.left, my = ev.clientY - b.top, yr = Math.min(st.year, yEnd);
      let best = null, bd = 8 * 8;
      people.forEach((p) => {
        if (!p.vis || yr < p.t0) return;
        const k = yr < p.t1 ? ease((yr - p.t0) / (p.t1 - p.t0)) : 1;
        for (let i = 0; i <= 20; i++) {
          const s = sub(p.o, p.q, p.l, 0, (i / 20) * k), dd = (sx(s[4]) - mx) ** 2 + (sy(s[5]) - my) ** 2;
          if (dd < bd) { bd = dd; best = { p }; }
        }
      });
      if (best) return best;
      bd = 7 * 7;
      nodes.forEach((n) => { if (!n.vis || n.private || n.est > yr) return; const dd = (sx(n.pt[0]) - mx) ** 2 + (sy(n.pt[1]) - my) ** 2; if (dd < bd) { bd = dd; best = { n }; } });
      return best;
    };
    // one finger (or the mouse) pans; two fingers pinch to zoom and pan together; a tap selects
    const fingers = new Map();                       // pointerId -> [clientX, clientY]
    let drag = null, pinch = null, pinched = false;
    const local = ([x, y]) => { const b = cv.getBoundingClientRect(); return [x - b.left, y - b.top]; };
    const pair = () => { const [a, b] = [...fingers.values()].slice(0, 2).map(local); return { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; };
    const grab = (x, y) => ({ x, y, cx: cam.cx, cy: cam.cy, moved: false });
    cv.addEventListener("pointerdown", (ev) => {
      cv.setPointerCapture(ev.pointerId);
      fingers.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (fingers.size >= 2) { pinch = pair(); pinched = true; drag = null; tip(null); return; }
      drag = grab(ev.clientX, ev.clientY);
    });
    cv.addEventListener("pointermove", (ev) => {
      if (fingers.has(ev.pointerId)) fingers.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pinch && fingers.size >= 2) {
        const now = pair();
        zoomAt(now.d / pinch.d, now.m[0], now.m[1]);
        cam.cx -= (now.m[0] - pinch.m[0]) / cam.z; cam.cy -= (now.m[1] - pinch.m[1]) / cam.z;
        pinch = now; cv.classList.add("dragging");
        return;
      }
      if (drag) {
        if (!drag.moved && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 4) return;
        drag.moved = true; cam.manual = true; $("#mg-follow").hidden = false; cv.classList.add("dragging"); tip(null);
        cam.cx = drag.cx - (ev.clientX - drag.x) / cam.z; cam.cy = drag.cy - (ev.clientY - drag.y) / cam.z;
        return;
      }
      if (ev.pointerType === "touch") return;          // no hover on a touch screen
      hov = hit(ev);
      cv.style.cursor = hov ? "pointer" : "";
      if (hov && hov.p) { const p = hov.p; tip(`<b>${esc(p.name)}</b><span>${p.year_how === "arrived" ? "Arrived" : p.year_how === "about" ? "About" : "By"} ${p.year} · ${esc(origin(p))}</span><i>${esc(journeyNote(p))}</i>`, ev); }
      else if (hov) { const n = hov.n; tip(`<b>${esc(n.name)}</b><span>${n.born || "?"}–${n.died || ""}</span><span>${n.basis === "born" ? esc(n.place || "") : `Birthplace not recorded<br>${n.basis === "child" ? "Child born" : esc(n.basis)}: ${esc(n.place || "")}`}</span>`, ev); }
      else tip(null);
    });
    const lift = (ev) => {
      fingers.delete(ev.pointerId);
      if (pinched) {                                   // after a pinch: the last finger left carries on panning; no tap
        pinch = null;
        const left = [...fingers.values()][0];
        drag = left ? Object.assign(grab(left[0], left[1]), { moved: true }) : null;
        if (!fingers.size) { pinched = false; cv.classList.remove("dragging"); }
        return true;
      }
      return false;
    };
    cv.addEventListener("pointercancel", (ev) => { lift(ev); drag = null; cv.classList.remove("dragging"); });
    cv.addEventListener("pointerup", (ev) => {
      if (lift(ev)) return;
      const was = drag; drag = null; cv.classList.remove("dragging");
      if (was && was.moved) return;
      const h = hit(ev);
      if (h && h.p) select(h.p.id);
      else if (h && h.n.person_id) location.hash = `#/person/${h.n.person_id}`;
      else if (st.sel) select(st.sel);
    });
    cv.addEventListener("pointerleave", () => { hov = null; tip(null); });
    cv.addEventListener("wheel", (ev) => { ev.preventDefault(); const b = cv.getBoundingClientRect(); zoomAt(ev.deltaY > 0 ? 1 / 1.15 : 1.15, ev.clientX - b.left, ev.clientY - b.top); }, { passive: false });
    $$("[data-mzi]", stage).forEach((b) => b.addEventListener("click", () => zoomAt(b.dataset.mzi === "1" ? 1.4 : 1 / 1.4, W / 2, H / 2)));
    $("#mg-follow").addEventListener("click", () => { cam.manual = false; $("#mg-follow").hidden = true; });
    // Safari's own pinch would zoom the whole page instead of the map
    const noPageZoom = (e) => e.preventDefault();
    stage.addEventListener("gesturestart", noPageZoom);

    /* ---- full screen: the browser's own where it has one; otherwise (iPhone Safari has none for a page) the stage
       is pinned over the whole window. Turning a phone sideways fills the screen; turning it back returns. */
    const fullBtn = $("#mg-full"), native = !!(stage.requestFullscreen && document.fullscreenEnabled);
    let filled = false, byTurn = false;
    const label = () => { fullBtn.textContent = document.fullscreenElement || filled ? "Exit full screen" : "Full screen"; };
    const fill = (on, turned) => {
      if (on === filled) return;
      filled = on; byTurn = on && !!turned;
      stage.classList.toggle("mig-filled", on);
      document.documentElement.classList.toggle("mig-locked", on);
      label();
    };
    fullBtn.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (filled) fill(false);
      else if (native) stage.requestFullscreen().catch(() => fill(true));
      else fill(true);
    });
    document.addEventListener("fullscreenchange", label);
    const sideways = matchMedia("(orientation: landscape) and (pointer: coarse) and (max-height: 560px)");
    const turn = () => { if (sideways.matches) fill(true, true); else if (byTurn) fill(false); };
    sideways.addEventListener("change", turn);
    turn();

    /* ---- the selected person's card */
    function select(id) {
      st.sel = st.sel === id ? null : id;
      const el = $("#mg-side"), p = st.sel && byId.get(st.sel);
      el.hidden = !p;
      if (!p) return;
      if (st.year < p.t1) st.year = Math.min(yMax, p.t1 + 0.1);
      el.innerHTML = `<button class="mig-x" id="mg-unsel">Close</button>
        <h3>${p.person_id ? `<a href="#/person/${p.person_id}">${esc(p.name)}</a>` : esc(p.name)}</h3>
        <p class="mig-sub">${p.born || "?"}–${p.died || ""}</p>
        <p class="mig-line">${esc(journeyNote(p))}</p>
        <ol class="mig-steps">
          <li style="--c:${glow(p.country)}"><b>Born</b> ${p.born || ""}<br><span>${esc(p.birth_place || p.country)}</span></li>
          ${p.left ? `<li style="--c:${glow(p.country)}"><b>Left</b> ${p.left.year || ""}<br><span>${esc(p.left.place)}</span></li>` : ""}
          ${p.trail.map((t) => `<li class="${t === p.landing ? "land" : ""}"><b>${esc(t.what)}</b> ${t.year || ""}<br><span>${esc(t.place)}</span></li>`).join("")}
        </ol>`;
      $("#mg-unsel").addEventListener("click", () => select(p.id));
    }

    /* ---- controls */
    $("#mg-play").addEventListener("click", () => setPlay(!st.playing));
    $$("[data-sp]", stage).forEach((b) => b.addEventListener("click", () => { st.speed = +b.dataset.sp; $$("[data-sp]", stage).forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#mg-range").addEventListener("input", (e) => { setPlay(false); st.year = +e.target.value; setPlay(false); });
    const onKey = (e) => {
      if (e.target.closest("input,select,textarea") && e.target.type !== "range") return;
      if (e.key === " " && !e.target.closest("button")) { e.preventDefault(); setPlay(!st.playing); }
    };
    document.addEventListener("keydown", onKey);
    const size = () => {
      W = stage.clientWidth; H = stage.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(2.6e6 / Math.max(1, W * H)));   // keep the fill cost bounded on large screens
      cv.width = W * dpr; cv.height = H * dpr; baseCam = null;
      barH = ($(".mig-time", stage) || {}).offsetHeight || 136;
    };
    const ro = new ResizeObserver(size);
    ro.observe(stage);
    size();
    refresh();
    setPlay(false);
    if (st.sel) { const id = st.sel; st.sel = null; select(id); }
    raf = requestAnimationFrame(frame);
    return {
      refresh,
      stop: () => {
        alive = false; st.playing = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("keydown", onKey);
        sideways.removeEventListener("change", turn); document.removeEventListener("fullscreenchange", label); fill(false);
      },
    };
  }

  const placeLabel = (pt) => {
    const parts = (pt.place || "").split(",").map((s) => s.trim()).filter(Boolean);
    return pt.precision === "county" ? `${parts.length > 2 ? parts[parts.length - 3] + ", " : ""}${pt.region}` : pt.region || parts[0] || "";
  };

  /* ---------------------------------------------------------------- from → to (a flow diagram) */
  function flowsView(host, people, visible, toMap) {
    const ps = people.filter((p) => (!st.countries.size || st.countries.has(p.country)) && (st.side === "all" || p.side === st.side));
    const byC = new Map(), byS = new Map();
    ps.forEach((p) => { byC.set(p.country, (byC.get(p.country) || 0) + 1); byS.set(p.state, (byS.get(p.state) || 0) + 1); });
    const topS = [...byS].sort((a, b) => b[1] - a[1]).slice(0, 11).map(([s]) => s);
    const sOf = (p) => (topS.includes(p.state) ? p.state : "Other states");
    const cs = [...byC].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const ss = [...topS, ...(ps.some((p) => !topS.includes(p.state)) ? ["Other states"] : [])];
    const W = 900, H = Math.max(420, ss.length * 40), gap = 8, x0 = 190, x1 = W - 190, nw = 14;
    const total = ps.length, unit = (H - gap * (Math.max(cs.length, ss.length) - 1)) / total;
    let bottom = H;   // small nodes get room for their label
    const place = (list, cnt) => { let y = 0; const m = new Map(); list.forEach((k) => { const h = cnt(k) * unit; m.set(k, { y, h, used: 0 }); y += Math.max(h, 12) + gap; }); bottom = Math.max(bottom, y - gap); return m; };
    const cN = place(cs, (c) => byC.get(c)), sN = place(ss, (s) => ps.filter((p) => sOf(p) === s).length);
    const links = new Map();
    ps.forEach((p) => { const k = `${p.country}|${sOf(p)}`; links.set(k, (links.get(k) || 0) + 1); });
    const order = [...links].sort((a, b) => cs.indexOf(a[0].split("|")[0]) - cs.indexOf(b[0].split("|")[0]) || ss.indexOf(a[0].split("|")[1]) - ss.indexOf(b[0].split("|")[1]));
    const bands = order.map(([k, n]) => {
      const [c, s] = k.split("|"), a = cN.get(c), b = sN.get(s), h = n * unit;
      const ya = a.y + a.used, yb = b.y + b.used; a.used += h; b.used += h;
      const mx = (x0 + nw + x1) / 2;
      return `<path class="mig-band" data-c="${esc(c)}" data-s="${esc(s)}" fill="${color(c)}" d="M${x0 + nw} ${ya}C${mx} ${ya} ${mx} ${yb} ${x1} ${yb}L${x1} ${yb + h}C${mx} ${yb + h} ${mx} ${ya + h} ${x0 + nw} ${ya + h}Z"><title>${n} from ${esc(c)} to ${esc(s)}</title></path>`;
    }).join("");
    host.innerHTML = `<section class="panel"><p class="small muted" style="margin-top:0">Where people born in each country first turn up in America. Band width is the number of people. Click a band to see those journeys on the map.</p>
      <svg class="mig-flow" viewBox="-4 -4 ${W + 8} ${bottom + 8}" role="img" aria-label="Flows from countries of birth to American states">
      ${bands}
      ${cs.map((c) => { const n = cN.get(c); return `<rect x="${x0}" y="${n.y}" width="${nw}" height="${Math.max(1, n.h)}" fill="${color(c)}"/><text x="${x0 - 8}" y="${n.y + n.h / 2}" text-anchor="end" dominant-baseline="middle">${esc(c)} <tspan class="n">${byC.get(c)}</tspan></text>`; }).join("")}
      ${ss.map((s) => { const n = sN.get(s); return `<rect x="${x1}" y="${n.y}" width="${nw}" height="${Math.max(1, n.h)}" class="mig-snode"/><text x="${x1 + nw + 8}" y="${n.y + n.h / 2}" dominant-baseline="middle">${esc(s)} <tspan class="n">${ps.filter((p) => sOf(p) === s).length}</tspan></text>`; }).join("")}
      </svg></section>`;
    $$(".mig-band", host).forEach((b) => b.addEventListener("click", () => {
      st.countries = new Set([b.dataset.c]);
      st.stateFilter = b.dataset.s === "Other states" ? null : b.dataset.s;
      toMap();
    }));
  }

  /* ---------------------------------------------------------------- list */
  function listView(host, people, visible, open) {
    const cols = [["year", "Year"], ["name", "Name"], ["country", "Born in"], ["state", "First in America"], ["moves", "Then"]];
    const drawList = () => {
      const q = st.q.toLowerCase();
      const ps = people.filter(visible).filter((p) => !q || `${p.name} ${p.birth_place} ${p.landing.place} ${p.country} ${p.state}`.toLowerCase().includes(q));
      const key = { year: (p) => p.year, name: (p) => p.name || "", country: (p) => p.country, state: (p) => p.state, moves: (p) => -p.moves.length }[st.sort];
      ps.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) || a.year - b.year; });
      $("#mg-rows").innerHTML = ps.map((p) => `<tr>
        <td class="num">${p.year}${p.year_how === "arrived" ? "" : `<span class="muted small"> ${p.year_how === "about" ? "c." : "by"}</span>`}</td>
        <td><button class="linkish" data-mp="${p.id}">${esc(p.name)}</button>${p.ahnen ? ` <span class="anum small">#${p.ahnen}</span>` : ""}</td>
        <td><i class="mig-sw" style="background:${p.c}"></i>${esc(p.origin.region ? `${p.origin.region}, ${p.country}` : p.country)}</td>
        <td>${esc(placeLabel(p.landing))}</td>
        <td class="small muted">${p.moves.length > 1 ? esc([...new Set(p.trail.filter((t) => t !== p.landing && t.year && t.year >= p.year).map((t) => t.region))].filter((r) => r !== p.state).join(", ") || "moved within " + p.state) : ""}</td></tr>`).join("");
      $("#mg-n").textContent = `${ps.length} people`;
      $$("[data-mp]", host).forEach((b) => b.addEventListener("click", () => open(+b.dataset.mp)));
    };
    host.innerHTML = `<section class="panel"><div class="toolbar"><input type="search" id="mg-q" placeholder="Search names and places" value="${esc(st.q)}" aria-label="Search immigrants"><span id="mg-n" class="small muted"></span></div>
      <div class="table-wrap"><table class="data"><thead><tr>${cols.map(([k, l]) => `<th${k === "year" ? ' class="num"' : ""}><button class="quiet small" data-sort="${k}">${l}${st.sort === k ? " ▾" : ""}</button></th>`).join("")}</tr></thead><tbody id="mg-rows"></tbody></table></div></section>`;
    $("#mg-q").addEventListener("input", (e) => { st.q = e.target.value; drawList(); });
    $$("[data-sort]", host).forEach((b) => b.addEventListener("click", () => { st.sort = b.dataset.sort; listView(host, people, visible, open); }));
    drawList();
  }

  window.KFMigrations = { render };
})();
