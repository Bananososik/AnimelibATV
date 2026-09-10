(function () {
  if (window.__animeLibTvInstalled) return;
  window.__animeLibTvInstalled = true;

  const STYLE_ID = 'animelib-tv-focus-style';
  const SETTINGS_ID = 'animelib-tv-settings';
  const FOCUS_ID = 'animelib-tv-focus-ring';
  const BASE_SELECTOR = [
    'a[href]', 'button', 'input', 'select', 'textarea',
    '[role="button"]', '[role="menuitem"]', '[role="option"]',
    '[tabindex]:not([tabindex="-1"])', 'summary', 'video', 'iframe',
    '[data-animelib-tv-focusable]'
  ].join(',');
  const DISCOVER_SELECTOR = [
    '[onclick]', '[class*="cursor-pointer"]', '[class*="clickable"]',
    '.aot_a4', '.tabs-item', '.menu-item', '[data-scroll-id]',
    '.awy_e', '.ayv_e', '.awl_a4', '[data-play]',
    '[class*="notification"]', '[class*="notifications"]',
    '[class*="notice"]', '[class*="bell"]',
    '[data-bottom-menu-name="notifications"]',
    '[data-dialog*="notification"]', '[data-popup*="notification"]',
    '[aria-label*="уведом" i]', '[title*="уведом" i]',
    '[aria-label*="notification" i]', '[title*="notification" i]'
  ].join(',');
  let lastFocusPoint = null;
  let currentElement = null;
  let observedViewport = null;
  let viewportObserver = null;

  function ensureDesktopViewport() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      (document.head || document.documentElement).appendChild(meta);
    }
    const desktopContent = 'width=1920, initial-scale=0.5, minimum-scale=0.5, maximum-scale=0.5, user-scalable=no';
    if (meta.content !== desktopContent) {
      meta.content = desktopContent;
      window.dispatchEvent(new Event('resize'));
    }
    if (observedViewport !== meta) {
      if (viewportObserver) viewportObserver.disconnect();
      observedViewport = meta;
      viewportObserver = new MutationObserver(ensureDesktopViewport);
      viewportObserver.observe(meta, {attributes: true, attributeFilter: ['content']});
    }
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .animelib-tv-focus {
        outline: 4px solid #b878ff !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 0 3px rgba(20, 8, 30, .9), 0 0 22px rgba(184, 120, 255, .95) !important;
        transition: outline-color .12s ease !important;
      }
      #${SETTINGS_ID} {
        position: fixed !important; right: 18px !important; bottom: 18px !important;
        width: 54px !important; height: 54px !important; border: 0 !important;
        border-radius: 50% !important; background: #8d46db !important; color: white !important;
        font-size: 27px !important; line-height: 54px !important; text-align: center !important;
        z-index: 2147483646 !important; opacity: .78 !important; cursor: pointer !important;
      }
      #${SETTINGS_ID}.animelib-tv-focus { opacity: 1 !important; }
      [id^="yandex_rtb"], [class*="yandex-rtb"], iframe[src*="yastatic.net/safeframe"] {
        display: none !important;
      }
      .awy_x[data-animelib-tv-hover] .awy_q {
        opacity: 1 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function focusRing() {
    let ring = document.getElementById(FOCUS_ID);
    if (ring || !document.body) return ring;
    ring = document.createElement('div');
    ring.id = FOCUS_ID;
    ring.setAttribute('aria-hidden', 'true');
    const style = ring.style;
    style.setProperty('position', 'fixed', 'important');
    style.setProperty('display', 'none', 'important');
    style.setProperty('pointer-events', 'none', 'important');
    style.setProperty('box-sizing', 'border-box', 'important');
    style.setProperty('border', '6px solid #b878ff', 'important');
    style.setProperty('border-radius', '8px', 'important');
    style.setProperty('box-shadow', '0 0 0 4px rgba(20, 8, 30, .9), 0 0 28px rgba(184, 120, 255, .98)', 'important');
    style.setProperty('z-index', '2147483647', 'important');
    document.body.appendChild(ring);
    return ring;
  }

  function updateFocusRing() {
    const ring = focusRing();
    if (!ring) return;
    if (!currentElement || !currentElement.isConnected || !visible(currentElement)) {
      ring.style.setProperty('display', 'none', 'important');
      return;
    }
    const rect = currentElement.getBoundingClientRect();
    const padding = 5;
    ring.style.setProperty('display', 'block', 'important');
    ring.style.setProperty('left', `${Math.max(0, rect.left - padding)}px`, 'important');
    ring.style.setProperty('top', `${Math.max(0, rect.top - padding)}px`, 'important');
    ring.style.setProperty('width', `${Math.min(innerWidth - rect.left + padding, rect.width + padding * 2)}px`, 'important');
    ring.style.setProperty('height', `${Math.min(innerHeight - rect.top + padding, rect.height + padding * 2)}px`, 'important');
  }

  function installSettingsButton() {
    if (!document.body || document.getElementById(SETTINGS_ID)) return;
    const button = document.createElement('button');
    button.id = SETTINGS_ID;
    button.type = 'button';
    button.textContent = '⚙';
    button.setAttribute('aria-label', 'Настройки AnimeLib TV');
    button.addEventListener('click', function () {
      if (window.AnimeLibTvNative) window.AnimeLibTvNative.openSettings();
    });
    document.body.appendChild(button);
  }

  function prepareInteractiveElements() {
    document.querySelectorAll('iframe, video').forEach(function (element) {
      if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');
    });
    document.querySelectorAll(DISCOVER_SELECTOR).forEach(function (element) {
      const attributes = [
        element.getAttribute('aria-label'), element.getAttribute('title'),
        element.getAttribute('data-bottom-menu-name'), element.getAttribute('data-dialog'),
        element.getAttribute('data-popup')
      ].filter(Boolean).join(' ').toLowerCase();
      const className = (element.getAttribute('class') || '').toLowerCase();
      const vueEvents = element._vei && Object.keys(element._vei).some(function (key) {
        return key.toLowerCase().includes('click');
      });
      const isAction = typeof element.onclick === 'function' || vueEvents ||
        getComputedStyle(element).cursor === 'pointer' ||
        /уведом|notification/.test(attributes) ||
        /(notification|notice)[_-]*(item|card|button|link)|bell/.test(className);
      if (!isAction) return;
      let target = element;
      const isNotificationIcon = /уведом|notification|bell/.test(`${attributes} ${className}`);
      if (isNotificationIcon) {
        let parent = element.parentElement;
        while (parent && parent !== document.body && getComputedStyle(parent).cursor === 'pointer') {
          const rect = parent.getBoundingClientRect();
          if (rect.width > 180 || rect.height > 100) break;
          target = parent;
          parent = parent.parentElement;
        }
      }
      if (target !== element) element.removeAttribute('data-animelib-tv-focusable');
      target.setAttribute('data-animelib-tv-focusable', 'true');
    });
  }

  function visible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const centerX = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const centerY = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(centerX, centerY);
    const isTopmost = element.id === SETTINGS_ID || hit === element || element.contains(hit);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none' &&
      Number(style.opacity || 1) > 0 && rect.width > 8 && rect.height > 8 &&
      rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth &&
      !element.disabled && element.getAttribute('aria-hidden') !== 'true' && isTopmost;
  }

  function label(element) {
    return ((element && (element.getAttribute('aria-label') || element.textContent)) || '')
      .replace(/\s+/g, ' ').trim();
  }

  function excluded(element) {
    return /^форум$/i.test(label(element));
  }

  function activeScope() {
    const scopes = Array.from(document.querySelectorAll(
      '[role="dialog"], [role="menu"], [role="tooltip"], .popup, .dropdown-menu'
    )).filter(function (element) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        rect.width > 40 && rect.height > 40 && rect.bottom > 0 && rect.top < innerHeight &&
        rect.right > 0 && rect.left < innerWidth;
    });
    return scopes[scopes.length - 1] || null;
  }

  function candidates() {
    const scope = activeScope();
    const items = Array.from((scope || document).querySelectorAll(BASE_SELECTOR))
      .filter(visible).filter(function (item) { return !excluded(item); });
    return items.filter(function (item, index) {
      const rect = item.getBoundingClientRect();
      const itemNative = item.matches('a[href], button, input, select, textarea, iframe, video');
      if (!itemNative && items.some(function (other) {
        return other !== item && item.contains(other) &&
          other.matches('a[href], button, input, select, textarea, iframe, video');
      })) return false;
      return !items.some(function (other, otherIndex) {
        if (index === otherIndex) return false;
        const otherRect = other.getBoundingClientRect();
        const sameBox = Math.abs(rect.left - otherRect.left) < 3 &&
          Math.abs(rect.top - otherRect.top) < 3 &&
          Math.abs(rect.width - otherRect.width) < 3 &&
          Math.abs(rect.height - otherRect.height) < 3;
        if (!sameBox) return false;
        const otherNative = other.matches('a[href], button, input, select, textarea, iframe, video');
        return (otherNative && !itemNative) || (otherNative === itemNative && otherIndex < index);
      });
    });
  }

  function mark(element) {
    document.querySelectorAll('.awy_x[data-animelib-tv-hover]').forEach(function (item) {
      item.removeAttribute('data-animelib-tv-hover');
    });
    currentElement = element || null;
    if (!element) {
      updateFocusRing();
      return;
    }
    let rect = element.getBoundingClientRect();
    const notification = element.closest && element.closest('.awy_x');
    if (notification) notification.setAttribute('data-animelib-tv-hover', 'true');
    try {
      element.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
      element.dispatchEvent(new MouseEvent('mousemove', {bubbles: true}));
    } catch (_) {}
    if (rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > innerHeight) {
      element.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'nearest'});
      rect = element.getBoundingClientRect();
    }
    lastFocusPoint = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    updateFocusRing();
  }

  function initial(items) {
    const inViewport = items.filter(function (element) {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    });
    const pool = inViewport.length ? inViewport : items;
    if (lastFocusPoint) {
      return pool.sort(function (a, b) {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const ad = Math.hypot(ar.left + ar.width / 2 - lastFocusPoint.x, ar.top + ar.height / 2 - lastFocusPoint.y);
        const bd = Math.hypot(br.left + br.width / 2 - lastFocusPoint.x, br.top + br.height / 2 - lastFocusPoint.y);
        return ad - bd;
      })[0];
    }
    const preferred = pool.find(function (element) { return /^каталог$/i.test(label(element)); }) ||
      pool.find(function (element) { return /^поиск$/i.test(label(element)); });
    if (preferred) return preferred;
    return pool.sort(function (a, b) {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const rowDifference = Math.floor(Math.max(0, ar.top) / 40) -
        Math.floor(Math.max(0, br.top) / 40);
      return rowDifference || (ar.left - br.left) || (ar.top - br.top);
    })[0];
  }

  function move(direction) {
    const items = candidates();
    if (!items.length) return;
    let current = currentElement;
    const scope = activeScope();
    if (scope && current && !scope.contains(current)) current = null;
    if (!current || !visible(current)) {
      const active = items.includes(document.activeElement) ? document.activeElement : null;
      mark(active || initial(items));
      return;
    }

    const from = current.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    let best = null;
    let bestScore = Infinity;

    items.forEach(function (item) {
      if (item === current) return;
      const rect = item.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x - fx;
      const dy = y - fy;
      const horizontal = direction === 'left' || direction === 'right';
      const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
      if (primary <= 8) return;
      const cross = horizontal ? Math.abs(dy) : Math.abs(dx);
      const overlap = horizontal
        ? Math.min(from.bottom, rect.bottom) - Math.max(from.top, rect.top)
        : Math.min(from.right, rect.right) - Math.max(from.left, rect.left);
      if (overlap <= 0 && cross > primary * 1.25) return;
      const primaryGap = direction === 'left' ? Math.max(0, from.left - rect.right)
        : direction === 'right' ? Math.max(0, rect.left - from.right)
        : direction === 'up' ? Math.max(0, from.top - rect.bottom)
        : Math.max(0, rect.top - from.bottom);
      const lanePenalty = overlap > 0 ? cross * 0.18 : 600 + cross * 3.2;
      const score = primaryGap + primary * 0.2 + lanePenalty;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    });

    if (best) {
      mark(best);
      return;
    }

    const horizontal = direction === 'left' || direction === 'right';
    let scroller = current.parentElement;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      const canScroll = horizontal
        ? scroller.scrollWidth > scroller.clientWidth + 8 && /auto|scroll/.test(style.overflowX)
        : scroller.scrollHeight > scroller.clientHeight + 8 && /auto|scroll/.test(style.overflowY);
      if (canScroll) break;
      scroller = scroller.parentElement;
    }
    const amount = horizontal ? 220 : 170;
    const sign = direction === 'left' || direction === 'up' ? -1 : 1;
    if (scroller && scroller !== document.body) {
      scroller.scrollBy(horizontal
        ? {left: sign * amount, behavior: 'smooth'}
        : {top: sign * amount, behavior: 'smooth'});
    } else if (!horizontal) {
      window.scrollBy({top: sign * amount, behavior: 'smooth'});
    }
    setTimeout(updateFocusRing, 180);
  }

  function activate() {
    const current = currentElement || document.activeElement;
    if (!current) return;
    if (current.tagName === 'IFRAME') {
      current.focus();
      try { current.contentWindow.focus(); } catch (_) {}
      const source = (current.getAttribute('src') || '').toLowerCase();
      const looksLikePlayer = /kodik|player|video|anilib/.test(source);
      if (window.AnimeLibTvNative) {
        if (looksLikePlayer) window.AnimeLibTvNative.enterFramePlayerMode();
        else window.AnimeLibTvNative.enterFrameMode();
      }
      return;
    }
    if (current.tagName === 'VIDEO') {
      current.focus();
      if (window.AnimeLibTvNative) window.AnimeLibTvNative.enterPlayerMode();
      return;
    }
    if (current.matches('input, textarea, select, [contenteditable="true"]')) {
      if (window.AnimeLibTvNative) {
        window.AnimeLibTvNative.showInput(
          current.value || current.textContent || '',
          current.getAttribute('type') || '',
          current.getAttribute('inputmode') || '',
          current.getAttribute('placeholder') || current.getAttribute('aria-label') || ''
        );
      }
      return;
    }
    current.click();
  }

  window.AnimeLibTv = {
    move: move,
    scrollPage: function (direction) {
      window.scrollBy({top: direction * 220, behavior: 'smooth'});
      setTimeout(updateFocusRing, 180);
    },
    activate: activate,
    setInputValue: function (value) {
      const current = currentElement;
      if (!current || !current.isConnected ||
          !current.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (current.matches('[contenteditable="true"]')) {
        current.textContent = value;
      } else {
        const prototype = current.tagName === 'TEXTAREA'
          ? HTMLTextAreaElement.prototype
          : current.tagName === 'SELECT'
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value');
        if (setter && setter.set) setter.set.call(current, value);
        else current.value = value;
      }
      current.dispatchEvent(new Event('input', {bubbles: true}));
      current.dispatchEvent(new Event('change', {bubbles: true}));
      current.focus({preventScroll: true});
      updateFocusRing();
    },
    leavePlayer: function () {
      if (document.activeElement) document.activeElement.blur();
      const player = currentElement;
      if (player) mark(player);
    },
    leaveFrame: function () {
      if (document.activeElement) document.activeElement.blur();
      const frame = currentElement;
      if (frame) mark(frame);
    }
  };

  ensureDesktopViewport();
  installStyle();
  installSettingsButton();
  focusRing();
  prepareInteractiveElements();
  window.addEventListener('resize', updateFocusRing, {passive: true});
  document.addEventListener('scroll', updateFocusRing, {passive: true, capture: true});
  let refreshScheduled = false;
  new MutationObserver(function () {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(function () {
      refreshScheduled = false;
      ensureDesktopViewport();
      installStyle();
      installSettingsButton();
      prepareInteractiveElements();
    });
  }).observe(document.documentElement, {childList: true, subtree: true});
})();
