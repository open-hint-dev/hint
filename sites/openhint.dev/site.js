/* HINT — shared interactions */
(function () {
  'use strict';

  /* Scroll reveal */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || els.length === 0) {
      els.forEach(function (e) { e.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* Copy buttons */
  function initCopy() {
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sel = btn.getAttribute('data-copy');
        var src = sel ? document.querySelector(sel) : btn.closest('.code-wrap').querySelector('.code__body');
        var text = btn.getAttribute('data-copy-text') || (src ? src.innerText : '');
        navigator.clipboard && navigator.clipboard.writeText(text.trim());
        var old = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = old; }, 1400);
      });
    });
  }

  /* Tabs */
  function initTabs() {
    document.querySelectorAll('[data-tabs]').forEach(function (group) {
      var btns = group.querySelectorAll('[data-tab]');
      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          var name = b.getAttribute('data-tab');
          btns.forEach(function (x) { x.classList.toggle('is-active', x === b); });
          group.querySelectorAll('[data-panel]').forEach(function (p) {
            p.classList.toggle('is-active', p.getAttribute('data-panel') === name);
          });
        });
      });
    });
  }

  /* Mobile menu */
  function initMenu() {
    var btn = document.querySelector('.nav__menu-btn');
    var menu = document.querySelector('.mobile-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.classList.remove('open'); document.body.style.overflow = ''; });
    });
  }

  /* Profession switcher (landing hero) */
  function initSwitcher() {
    var root = document.querySelector('[data-switcher]');
    if (!root) return;
    var btns = root.querySelectorAll('[data-prof]');
    var panels = document.querySelectorAll('[data-prof-panel]');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        var prof = b.getAttribute('data-prof');
        btns.forEach(function (x) { x.classList.toggle('is-active', x === b); });
        panels.forEach(function (p) {
          var match = p.getAttribute('data-prof-panel') === prof;
          if (match) {
            p.removeAttribute('hidden');
            p.classList.remove('swap-out'); p.classList.add('swap-in');
          } else if (!p.hasAttribute('hidden')) {
            p.classList.remove('swap-in');
            p.setAttribute('hidden', '');
          }
        });
        var host = document.querySelector('[data-accent-host]');
        if (host) host.setAttribute('data-accent', b.getAttribute('data-accent') || '');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initReveal(); initCopy(); initTabs(); initMenu(); initSwitcher();
  });
})();
