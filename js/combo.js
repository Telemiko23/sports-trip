/* ToSport v2 - accessible autocomplete (ARIA 1.2 combobox with a listbox popup). Browser only.
   ToSport.combo(input, {items(text) -> [{label, sub, value}], onSelect(item), onInput(text), emptyText, announce(text)})
   - typing, pasting (the `input` event) and touch/pointer all use the same path
   - Arrow keys move the highlight; Enter picks the highlighted option (and ONLY that - it never also submits the form);
     Enter with nothing highlighted is left alone so the surrounding form can submit; Escape closes the list first. */
(function (root) {
  'use strict';
  var uid = 0;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function combo(input, opts) {
    var id = 'cb' + (++uid), list = document.createElement('ul'), open = false, items = [], active = -1;
    list.id = id + '-list'; list.className = 'combo-menu'; list.setAttribute('role', 'listbox'); list.hidden = true;
    input.parentNode.appendChild(list);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', list.id); input.setAttribute('autocomplete', 'off'); input.setAttribute('autocapitalize', 'off'); input.setAttribute('spellcheck', 'false');

    function setOpen(v) {
      open = v; list.hidden = !v; input.setAttribute('aria-expanded', String(v));
      if (!v) { active = -1; input.removeAttribute('aria-activedescendant'); }
    }
    function mark(text, q) {
      var i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
      return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
    }
    function render(q) {
      if (!items.length) { list.innerHTML = '<li class="combo-empty" role="presentation">' + esc(opts.emptyText || '') + '</li>'; return; }
      list.innerHTML = items.slice(0, 40).map(function (it, i) {
        return '<li class="combo-opt" role="option" id="' + id + '-o' + i + '" data-i="' + i + '" aria-selected="false"><bdi dir="auto">' + mark(it.label, q) + '</bdi>' + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</li>';
      }).join('');
    }
    function highlight(i) {
      var opt = list.querySelectorAll('[role=option]');
      Array.prototype.forEach.call(opt, function (el, k) { el.setAttribute('aria-selected', String(k === i)); el.classList.toggle('active', k === i); });
      active = i;
      if (i >= 0 && opt[i]) { input.setAttribute('aria-activedescendant', opt[i].id); opt[i].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
    }
    function refresh() {
      var q = input.value.trim();
      if (!q) { items = []; setOpen(false); return; }
      items = opts.items ? opts.items(q) : [];
      render(q); setOpen(true); active = -1;
      if (opts.announce) opts.announce(items.length ? items.length + ' ' + (opts.countWord || '') : (opts.emptyText || ''));
    }
    function choose(it) { if (!it) return; input.value = it.label; setOpen(false); if (opts.onSelect) opts.onSelect(it); }

    input.addEventListener('input', function () { refresh(); if (opts.onInput) opts.onInput(input.value); });
    input.addEventListener('focus', function () { if (input.value.trim() && opts.openOnFocus !== false) refresh(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!open) { if (input.value.trim()) refresh(); if (!open) return; }
        e.preventDefault();
        var n = Math.min(items.length, 40);
        if (!n) return;
        highlight(e.key === 'ArrowDown' ? (active + 1) % n : (active <= 0 ? n - 1 : active - 1));
      } else if (e.key === 'Enter') {
        if (open && active >= 0) { e.preventDefault(); e.stopPropagation(); choose(items[active]); }
      } else if (e.key === 'Escape') {
        if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
      } else if (e.key === 'Tab') setOpen(false);
    });
    list.addEventListener('pointerdown', function (e) {
      var row = e.target.closest ? e.target.closest('[role=option]') : null;
      if (!row) return;
      e.preventDefault();
      choose(items[Number(row.getAttribute('data-i'))]);
    });
    input.addEventListener('blur', function () { setTimeout(function () { setOpen(false); }, 120); });
    return { close: function () { setOpen(false); }, refresh: refresh, isOpen: function () { return open; } };
  }

  root.ToSport = root.ToSport || {};
  root.ToSport.combo = combo;
})(typeof self !== 'undefined' ? self : this);
