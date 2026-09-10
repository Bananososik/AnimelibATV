(function () {
  if (window.__animeLibTvInstalled) return;
  window.__animeLibTvInstalled = true;

  const STYLE_ID = 'animelib-tv-focus-style';
  const SETTINGS_ID = 'animelib-tv-settings';
  const selector = [
    'a[href]', 'button', 'input', 'select', 'textarea',
    '[role="button"]', '[tabindex]:not([tabindex="-1"])', 'video', 'iframe'
  ].join(',');

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
        transform: scale(1.035) !important;
        transition: outline-color .12s ease, transform .12s ease !important;
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

  function prepareFrames() {
    document.querySelectorAll('iframe, video').forEach(function (element) {
      element.setAttribute('tabindex', '0');
    });
  }

  function visible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const isContainer = (element.tagName === 'DIV' || element.tagName === 'SPAN') &&
      !element.getAttribute('role') &&
      element.querySelector('a[href], button, input, select, textarea, iframe, video');
    const centerX = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const centerY = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(centerX, centerY);
    const isTopmost = element.id === SETTINGS_ID || hit === element || element.contains(hit);
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0 && rect.width > 8 && rect.height > 8 &&
      rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth &&
      !element.disabled && !isContainer && isTopmost;
  }

  function candidates() {
    return Array.from(document.querySelectorAll(selector)).filter(visible);
  }

  function mark(element) {
    document.querySelectorAll('.animelib-tv-focus').forEach(function (old) {
      old.classList.remove('animelib-tv-focus');
      old.style.removeProperty('outline');
      old.style.removeProperty('outline-offset');
      old.style.removeProperty('box-shadow');
    });
    if (!element) return;
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
    element.scrollIntoView({block: 'center', inline: 'center', behavior: 'smooth'});
  }

  function initial(items) {
    const inViewport = items.filter(function (element) {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    });
    const pool = inViewport.length ? inViewport : items;
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
      mark(initial(items));
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
      const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
      if (primary <= 4) return;
      const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = primary + cross * 2.4 + (cross > primary * 1.4 ? 1000 : 0);
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
  prepareFrames();
  new MutationObserver(function () {
    ensureDesktopViewport();
    installStyle();
    installSettingsButton();
    prepareFrames();
  }).observe(document.documentElement, {childList: true, subtree: true, attributes: true});
})();
