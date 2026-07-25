/* brycewaddell.com — site behavior
   Kept in an external file so the Content-Security-Policy can use a strict
   script-src 'self' (no 'unsafe-inline'). */
(function () {
  'use strict';

  /* ---- Mobile nav: hamburger toggle ---- */
  var nav = document.querySelector('nav');
  var toggle = nav && nav.querySelector('.nav-toggle');

  if (nav && toggle) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    /* close the menu after tapping a link */
    nav.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---- Fan-chart ancestor tooltip ---- */
  var segs = document.querySelectorAll('.fanchart .seg');
  if (!segs.length) return;

  var tip = document.createElement('div');
  tip.className = 'fan-tip';
  document.body.appendChild(tip);

  /* Build with textContent rather than innerHTML so ancestor data can never
     be interpreted as markup. */
  function row(label, value) {
    var d = document.createElement('div');
    d.className = 'tl';
    var b = document.createElement('b');
    b.textContent = label;
    d.appendChild(b);
    d.appendChild(document.createTextNode(value));
    return d;
  }

  function show(el) {
    var name = el.getAttribute('data-name') || '';
    var yrs = el.getAttribute('data-years');
    var place = el.getAttribute('data-place');
    var eth = el.getAttribute('data-eth');

    tip.textContent = '';

    var n = document.createElement('div');
    n.className = 'tn';
    n.textContent = name;
    tip.appendChild(n);

    if (yrs) {
      var y = document.createElement('div');
      y.className = 'ty';
      y.textContent = yrs;
      tip.appendChild(y);
    }
    if (place) tip.appendChild(row('Born', place));
    if (eth) tip.appendChild(row('Estimated Roots', eth));

    tip.style.display = 'block';
  }

  function move(e) {
    var x = e.clientX + 16;
    var y = e.clientY + 14;
    var r = tip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 12;
    tip.style.left = Math.max(6, x) + 'px';
    tip.style.top = Math.max(6, y) + 'px';
  }

  function hide() {
    tip.style.display = 'none';
  }

  segs.forEach(function (el) {
    el.addEventListener('mouseenter', function () { show(el); });
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', hide);
    el.addEventListener('click', function (e) {
      show(el);
      move(e);
      e.stopPropagation();
    });
  });

  document.addEventListener('click', hide);
})();
