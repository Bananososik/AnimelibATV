(function () {
  if (window.__animeLibTvInstalled) return;
  window.__animeLibTvInstalled = true;

  const STYLE_ID = 'animelib-tv-focus-style';
  const SETTINGS_ID = 'animelib-tv-settings';
  const BASE_SELECTOR = [
    'a[href]', 'button', 'input', 'select', 'textarea',
    '[role="button"]', '[role="menuitem"]', '[role="option"]',
    '[tabindex]:not([tabindex="-1"])', 'summary', 'video', 'iframe',
    '[data-animelib-tv-focusable]'
  ].join(',');
  const DISCOVER_SELECTOR = [
    '[onclick]', '[class*="cursor-pointer"]', '[class*="clickable"]',
    '[class*="notification"]', '[class*="notifications"]',
    '[class*="notice"]', '[class*="bell"]',
    '[data-bottom-menu-name="notifications"]',
    '[data-dialog*="notification"]', '[data-popup*="notification"]',
    '[aria-label*="уведом" i]', '[title*="уведом" i]',
    '[aria-label*="notification" i]', '[title*="notification" i]'
  ].join(',');
  let lastFocusPoint = null;

  function ensureDesktopViewport() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      (document.head || document.documentElement).appendChild(meta);
    }
    const desktopContent = 'width=1920, initial-scale=0.5, minimum-scale=0.5, maximum-scale=0.5, user-scalable=no';
    if (meta.content !== desktopContent) meta.content = desktopContent;
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
        position: relative !important;
        z-index: 2147483000 !important;
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
    `;
    (document.head || document.documentElement).appendChild(style);
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
      const className = typeof element.className === 'string' ? element.className.toLowerCase() : '';
      const vueEvents = element._vei && Object.keys(element._vei).some(function (key) {
        return key.toLowerCase().includes('click');
      });
      const isAction = typeof element.onclick === 'function' || vueEvents ||
        getComputedStyle(element).cursor === 'pointer' ||
        /уведом|notification/.test(attributes) ||
        /(notification|notice)[_-]*(item|card|button|link)|bell/.test(className);
      if (isAction) element.setAttribute('data-animelib-tv-focusable', 'true');
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

  function candidates() {
    const items = Array.from(document.querySelectorAll(BASE_SELECTOR)).filter(visible);
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
    document.querySelectorAll('.animelib-tv-focus').forEach(function (old) {
      old.classList.remove('animelib-tv-focus');
      old.style.removeProperty('outline');
      old.style.removeProperty('outline-offset');
      old.style.removeProperty('box-shadow');
    });
    if (!element) return;
    if (element.tabIndex < 0) element.setAttribute('tabindex', '-1');
    element.classList.add('animelib-tv-focus');
    // Direct CSSOM properties also work on OAuth pages whose CSP rejects
    // dynamically inserted <style> rules.
    element.style.setProperty('outline', '6px solid #b878ff', 'important');
    element.style.setProperty('outline-offset', '4px', 'important');
    element.style.setProperty(
      'box-shadow',
      '0 0 0 4px rgba(20, 8, 30, .9), 0 0 28px rgba(184, 120, 255, .98)',
      'important'
    );
    try { element.focus({preventScroll: true}); } catch (_) { element.focus(); }
    let rect = element.getBoundingClientRect();
    const margin = 32;
    if (rect.top < margin || rect.bottom > innerHeight - margin ||
        rect.left < margin || rect.right > innerWidth - margin) {
      element.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'auto'});
      rect = element.getBoundingClientRect();
    }
    lastFocusPoint = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
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
    return pool.sort(function (a, b) {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (ar.top - br.top) || (ar.left - br.left);
    })[0];
  }

  function move(direction) {
    const items = candidates();
    if (!items.length) return;
    let current = document.querySelector('.animelib-tv-focus');
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

    if (best) mark(best);
  }

  function activate() {
    const current = document.querySelector('.animelib-tv-focus') || document.activeElement;
    if (!current) return;
    if (current.tagName === 'IFRAME') {
      current.focus();
      const source = (current.getAttribute('src') || '').toLowerCase();
      const looksLikePlayer = /kodik|player|video|anilib/.test(source);
      if (window.AnimeLibTvNative) {
        if (looksLikePlayer) window.AnimeLibTvNative.enterPlayerMode();
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
      current.focus();
      current.click();
      if (window.AnimeLibTvNative) window.AnimeLibTvNative.showKeyboard();
      return;
    }
    current.click();
  }

  window.AnimeLibTv = {
    move: move,
    activate: activate,
    leavePlayer: function () {
      if (document.activeElement) document.activeElement.blur();
      const player = document.querySelector('.animelib-tv-focus');
      if (player) mark(player);
    },
    leaveFrame: function () {
      if (document.activeElement) document.activeElement.blur();
      const frame = document.querySelector('.animelib-tv-focus');
      if (frame) mark(frame);
    }
  };

  ensureDesktopViewport();
  installStyle();
  installSettingsButton();
  prepareInteractiveElements();
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
