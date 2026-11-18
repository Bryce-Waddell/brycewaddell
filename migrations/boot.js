/* The public Migrations page: the helpers migrations.js expects from app.js, an api() that answers from the
   exported snapshot in data.js instead of the Kinfold server, and the start. No network calls. */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n, d = 0) => (n == null || n === "" ? "" : Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));
async function api() { return window.KF_MIGRATIONS_DATA; }
const tip = $("#tip");
function showTip(html, ev) {
  tip.innerHTML = html;
  tip.hidden = false;
  tip.style.left = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px";
  tip.style.top = Math.min(ev.clientY + 14, innerHeight - tip.offsetHeight - 8) + "px";
}
const hideTip = () => (tip.hidden = true);
// the canvas draws its names in the site's own face
window.KF_SERIF = '"EB Garamond", Georgia, serif';
// the page's own footnote: what changes how the map reads, nothing about record years
window.KF_TEXT = { title: "Ancestral Migrations", note: "Colonial borders are today's state lines; from 1783 they are as they stood. An ancestor with no recorded birthplace is shown at their first record, or with their child." };
document.addEventListener("DOMContentLoaded", async () => {
  if (document.fonts && document.fonts.load) await Promise.all([document.fonts.load('italic 15px "EB Garamond"'), document.fonts.load('15px "EB Garamond"')]).catch(() => {});
  await window.KFMigrations.render($("#view"));
});
