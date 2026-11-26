(() => {
  'use strict';

  let openMenu;

  function touchMode(menu) {
    if (menu.panel.hasAttribute('data-touch-open')) return;
    menu.panel.setAttribute('data-touch-open', '');
    document.addEventListener('touchmove', containTouch, { capture: true, passive: false });
  }

  function trackTouch(event) {
    const menu = openMenu;
    if (!menu?.panel.matches(':popover-open')) {
      if (menu) release(menu);
      return;
    }
    const point = event.touches.length === 1 ? event.touches[0] : null;
    menu.gesture = point ? {
      id: point.identifier,
      x: point.clientX,
      y: point.clientY,
      inList: event.target instanceof Node && menu.list.contains(event.target),
    } : null;
    if (point) touchMode(menu);
  }

  function containTouch(event) {
    const menu = openMenu;
    const gesture = menu?.gesture;
    if (!gesture || event.touches.length !== 1 || !menu.panel.matches(':popover-open')) return;
    const point = event.touches[0];
    if (point.identifier !== gesture.id) return;
    const x = point.clientX - gesture.x;
    const y = point.clientY - gesture.y;
    gesture.x = point.clientX;
    gesture.y = point.clientY;
    if (Math.abs(y) <= Math.abs(x)) return;
    const { scrollTop, scrollHeight, clientHeight } = menu.list;
    const canScroll = gesture.inList && (y > 0 ? scrollTop > 1 : scrollTop + clientHeight < scrollHeight - 1);
    if (!canScroll && event.cancelable) event.preventDefault();
  }

  function release(menu) {
    if (openMenu !== menu) return;
    openMenu = undefined;
    menu.panel.removeAttribute('data-touch-open');
    document.removeEventListener('touchstart', trackTouch, true);
    document.removeEventListener('touchmove', containTouch, true);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function create({ id, label, options = [], value = '', placeholder = label, display, search, leading,
    className = '', triggerClass = '', align = 'start', beside, onSelect }) {
    const root = element('div', ('choice-menu ' + className).trim());
    const trigger = element('button', ('choice-trigger ' + triggerClass).trim());
    const caption = element('span', 'choice-caption');
    const arrow = element('span', 'choice-chevron');
    const panel = element('div', 'choice-panel');
    const list = element('div', 'choice-options');
    const empty = element('p', 'choice-empty', '没有匹配项');
    const input = search ? element('input', 'choice-search-input') : null;
    let visible = [];
    let active = -1;
    let disabled = false;
    let touchOnTrigger = false;

    trigger.type = 'button';
    trigger.id = id;
    trigger.setAttribute('aria-haspopup', input ? 'dialog' : 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', id + (input ? '-panel' : '-options'));
    arrow.setAttribute('aria-hidden', 'true');
    if (leading) trigger.append(leading);
    trigger.append(caption, arrow);
    panel.id = id + '-panel';
    panel.setAttribute('popover', 'auto');
    trigger.setAttribute('popovertarget', panel.id);
    list.id = id + '-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', label);
    list.tabIndex = input ? -1 : 0;
    empty.setAttribute('role', 'status');
    if (input) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', label);
      input.type = 'search';
      input.placeholder = search;
      input.spellcheck = false;
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-label', search);
      input.setAttribute('aria-controls', list.id);
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', 'true');
      const field = element('div', 'choice-search');
      field.append(element('span', 'choice-search-icon'), input);
      panel.append(field);
    } else {
      panel.append(element('div', 'choice-heading', label));
    }
    panel.append(list, empty);
    root.append(trigger, panel);

    function sync() {
      const selected = options.find(option => option.value === value);
      caption.textContent = display || selected?.label || placeholder;
      root.toggleAttribute('data-placeholder', !selected && !display);
      trigger.setAttribute('aria-label', selected || placeholder !== label ? label + '，' + (selected?.label || placeholder) : label);
      trigger.title = selected?.label || label;
      trigger.disabled = disabled || options.length === 0;
    }

    function highlight(index, scroll = false) {
      active = index;
      list.querySelector('[data-active]')?.removeAttribute('data-active');
      const row = list.children[index];
      for (const control of input ? [list, input] : [list]) {
        if (row) control.setAttribute('aria-activedescendant', row.id);
        else control.removeAttribute('aria-activedescendant');
      }
      if (!row) return;
      row.setAttribute('data-active', '');
      if (scroll) {
        const top = row.offsetTop;
        const bottom = top + row.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
      }
    }

    function filter() {
      const terms = (input?.value || '').trim().toLocaleLowerCase().normalize('NFC').split(/\s+/).filter(Boolean);
      visible = options.filter(option => {
        const text = [option.label, option.keywords, option.detail].filter(Boolean).join(' ').toLocaleLowerCase().normalize('NFC');
        return terms.every(term => text.includes(term));
      });
      list.replaceChildren(...visible.map((option, index) => {
        const row = element('div', 'choice-option');
        const text = element('span', 'choice-option-text', option.label);
        const check = element('span', 'choice-check', '✓');
        row.id = id + '-option-' + index;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(option.value === value));
        check.setAttribute('aria-hidden', 'true');
        if (option.detail) text.append(element('small', '', option.detail));
        row.append(text, check);
        row.addEventListener('click', () => choose(option));
        return row;
      }));
      empty.hidden = visible.length > 0;
      list.scrollTop = 0;
      highlight(visible.length ? Math.max(0, visible.findIndex(option => option.value === value)) : -1);
    }

    function close(restoreFocus = false) {
      if (!panel.matches(':popover-open')) return;
      panel.hidePopover();
      if (openMenu?.panel === panel) release(openMenu);
      if (restoreFocus) trigger.focus({ preventScroll: true });
    }

    function choose(option) {
      close(true);
      if (value === option.value) return;
      value = option.value;
      sync();
      onSelect?.(value);
    }

    function place() {
      if (!panel.matches(':popover-open')) return;
      const anchor = trigger.getBoundingClientRect();
      const edge = 10;
      const side = beside?.() === true;
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + edge;
      const top = (viewport?.offsetTop ?? 0) + edge;
      const widthLimit = Math.max(0, (viewport?.width ?? document.documentElement.clientWidth) - edge * 2);
      const heightLimit = Math.max(0, (viewport?.height ?? window.innerHeight) - edge * 2);
      panel.style.minWidth = Math.min(anchor.width, widthLimit) + 'px';
      panel.style.maxWidth = widthLimit + 'px';
      panel.style.maxHeight = heightLimit + 'px';
      const below = anchor.bottom + 5;
      const above = anchor.top - 5;
      const roomBelow = top + heightLimit - below;
      const roomAbove = above - top;
      const opensUp = !side && panel.offsetHeight > roomBelow && roomAbove > roomBelow;
      const room = opensUp ? roomAbove : roomBelow;
      if (!side && room >= 120 && room < panel.offsetHeight) panel.style.maxHeight = room + 'px';

      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const preferredLeft = side ? anchor.right + 6 : align === 'end' ? anchor.right - width : anchor.left;
      const preferredTop = side ? anchor.top : opensUp ? above - height : below;
      panel.style.left = Math.max(left, Math.min(preferredLeft, left + widthLimit - width)) + 'px';
      panel.style.top = Math.max(top, Math.min(preferredTop, top + heightLimit - height)) + 'px';
      panel.dataset.opens = opensUp ? 'up' : 'down';
    }

    function show(viaTouch = false) {
      if (trigger.disabled || panel.matches(':popover-open')) return;
      if (input) input.value = '';
      filter();
      panel.showPopover();
      if (!panel.matches(':popover-open')) return;
      if (openMenu) release(openMenu);
      openMenu = { panel, list, place };
      document.addEventListener('touchstart', trackTouch, { capture: true, passive: true });
      if (viaTouch) touchMode(openMenu);
      place();
      (viaTouch ? list : input || list).focus({ preventScroll: true });
      highlight(active, true);
    }

    trigger.addEventListener('pointerdown', event => { touchOnTrigger = event.pointerType === 'touch'; });
    trigger.addEventListener('touchstart', () => { touchOnTrigger = true; }, { passive: true });
    trigger.addEventListener('click', event => {
      event.preventDefault();
      const viaTouch = event.pointerType === 'touch' || (event.detail > 0 && touchOnTrigger);
      touchOnTrigger = false;
      if (panel.matches(':popover-open')) close();
      else show(viaTouch);
    });
    trigger.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      show();
    });
    panel.addEventListener('toggle', () => {
      const open = panel.matches(':popover-open');
      trigger.setAttribute('aria-expanded', String(open));
      if (!open && openMenu?.panel === panel) release(openMenu);
    });
    input?.addEventListener('input', () => { filter(); place(); });
    panel.addEventListener('keydown', event => {
      if (event.isComposing) return;
      const { key } = event;
      if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (key === 'Tab') {
        close(true);
      } else if (visible.length && (key === 'ArrowDown' || key === 'ArrowUp')) {
        event.preventDefault();
        highlight((active + (key === 'ArrowDown' ? 1 : visible.length - 1)) % visible.length, true);
      } else if (event.target !== input && visible.length && (key === 'Home' || key === 'End')) {
        event.preventDefault();
        highlight(key === 'Home' ? 0 : visible.length - 1, true);
      } else if (key === 'Enter') {
        event.preventDefault();
        if (active >= 0) choose(visible[active]);
      }
    });
    sync();
    return {
      element: root,
      trigger,
      get value() { return value; },
      setOptions(entries, selected = '') {
        close();
        options = entries;
        value = options.some(option => option.value === selected) ? selected : '';
        sync();
      },
      setDisabled(value) {
        disabled = value;
        if (value) close();
        sync();
      },
    };
  }

  function placeOpenMenu() {
    if (openMenu?.panel.matches(':popover-open')) openMenu.place();
    else if (openMenu) release(openMenu);
  }

  window.addEventListener('resize', placeOpenMenu);
  window.addEventListener('scroll', event => {
    if (openMenu && (!(event.target instanceof Node) || !openMenu.panel.contains(event.target))) placeOpenMenu();
  }, { passive: true, capture: true });
  window.visualViewport?.addEventListener('resize', placeOpenMenu);
  window.visualViewport?.addEventListener('scroll', placeOpenMenu);
  window.FlowDeskChoiceMenu = { create, isOpen: () => Boolean(openMenu?.panel.matches(':popover-open')) };
})();
