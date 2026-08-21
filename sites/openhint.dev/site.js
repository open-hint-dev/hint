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
      if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Copy text');
      btn.addEventListener('click', function () {
        var sel = btn.getAttribute('data-copy');
        var wrap = btn.closest('.code-wrap');
        var src = sel ? document.querySelector(sel) : (wrap && wrap.querySelector('.code__body'));
        var text = btn.getAttribute('data-copy-text') || (src ? src.innerText : '');
        if (navigator.clipboard) navigator.clipboard.writeText(text.trim());
        var old = btn.textContent;
        btn.textContent = 'Copied';
        var status = btn.parentElement && btn.parentElement.querySelector('.copy-status');
        if (status) status.textContent = 'Message copied.';
        setTimeout(function () { btn.textContent = old; if (status) status.textContent = ''; }, 1400);
      });
    });
  }

  /* Tabs */
  function initTabs() {
    document.querySelectorAll('[data-tabs]').forEach(function (group) {
      var btns = Array.prototype.slice.call(group.querySelectorAll('[data-tab]'));
      var panels = Array.prototype.slice.call(group.querySelectorAll('[data-panel]'));
      group.setAttribute('role', 'tablist');
      btns.forEach(function (button, index) {
        var name = button.getAttribute('data-tab');
        var panel = panels.find(function (candidate) { return candidate.getAttribute('data-panel') === name; });
        button.setAttribute('role', 'tab');
        button.id = button.id || 'tab-' + name + '-' + index;
        button.setAttribute('tabindex', button.classList.contains('is-active') ? '0' : '-1');
        button.setAttribute('aria-selected', button.classList.contains('is-active') ? 'true' : 'false');
        if (panel) {
          panel.id = panel.id || 'panel-' + name + '-' + index;
          panel.setAttribute('role', 'tabpanel');
          panel.setAttribute('aria-labelledby', button.id);
          button.setAttribute('aria-controls', panel.id);
        }
      });
      function activate(b) {
        var name = b.getAttribute('data-tab');
        btns.forEach(function (x) {
          var active = x === b;
          x.classList.toggle('is-active', active);
          x.setAttribute('aria-selected', active ? 'true' : 'false');
          x.setAttribute('tabindex', active ? '0' : '-1');
        });
        panels.forEach(function (p) {
          var active = p.getAttribute('data-panel') === name;
          p.classList.toggle('is-active', active);
          p.hidden = !active;
        });
      }
      btns.forEach(function (b) {
        b.addEventListener('click', function () { activate(b); });
        b.addEventListener('keydown', function (event) {
          var index = btns.indexOf(b);
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          var next = event.key === 'Home' ? 0 : event.key === 'End' ? btns.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
          activate(btns[next]);
          btns[next].focus();
        });
      });
    });
  }

  /* Mobile menu */
  function initMenu() {
    var btn = document.querySelector('.nav__menu-btn');
    var menu = document.querySelector('.mobile-menu');
    if (!btn || !menu) return;
    var priorFocus = null;
    function setOpen(open) {
      menu.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) {
        priorFocus = document.activeElement;
        var first = menu.querySelector('a');
        if (first) first.focus();
      } else if (priorFocus) priorFocus.focus();
    }
    btn.addEventListener('click', function () { setOpen(!menu.classList.contains('open')); });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menu.classList.contains('open')) setOpen(false);
      if (event.key !== 'Tab' || !menu.classList.contains('open')) return;
      var focusable = Array.prototype.slice.call(menu.querySelectorAll('a'));
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  /* Profession switcher (landing hero) */
  function initSwitcher() {
    var root = document.querySelector('[data-switcher]');
    if (!root) return;
    var btns = root.querySelectorAll('[data-prof]');
    var panels = document.querySelectorAll('[data-prof-panel]');
    function activateProfession(b) {
      if (b.disabled) return;
      var prof = b.getAttribute('data-prof');
      btns.forEach(function (x) {
        var active = x === b;
        x.classList.toggle('is-active', active);
        x.setAttribute('aria-selected', active ? 'true' : 'false');
        x.setAttribute('tabindex', active ? '0' : '-1');
      });
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
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () { activateProfession(b); });
      b.addEventListener('keydown', function (event) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        var buttons = Array.prototype.slice.call(btns);
        var index = buttons.indexOf(b);
        var next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        activateProfession(buttons[next]);
        buttons[next].focus();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initReveal(); initCopy(); initTabs(); initMenu(); initSwitcher();
  });
})();
