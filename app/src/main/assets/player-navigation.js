(function () {
  'use strict';

  if (window.__animeLibTvPlayerInstalled) return;
  window.__animeLibTvPlayerInstalled = true;

  let selected = null;
  let ring = null;

  function ensureStyle() {
    if (document.getElementById('animelib-tv-player-style')) return;
    const style = document.createElement('style');
    style.id = 'animelib-tv-player-style';
    style.textContent = `
      .fp-quality[data-animelib-tv-player-selected] .fp-quality-dropdown,
      .fp-playback-settings[data-animelib-tv-player-selected] .dropdown {
        visibility: visible !important;
        opacity: 1 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function visible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0 && rect.width > 3 && rect.height > 3 &&
      rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }

  function ensureRing() {
    if (ring && ring.isConnected) return ring;
    ring = document.createElement('div');
    ring.setAttribute('data-animelib-tv-player-focus', '');
    Object.assign(ring.style, {
      position: 'fixed',
      zIndex: '2147483647',
      pointerEvents: 'none',
      border: '4px solid #a855f7',
      borderRadius: '8px',
      boxShadow: '0 0 0 3px rgba(0,0,0,.75), 0 0 16px rgba(168,85,247,.9)',
      transition: 'left 90ms, top 90ms, width 90ms, height 90ms',
      display: 'none'
    });
    (document.body || document.documentElement).appendChild(ring);
    return ring;
  }

  function mark(element) {
    if (!visible(element)) return false;
    document.querySelectorAll('[data-animelib-tv-player-selected]').forEach(function (item) {
      item.removeAttribute('data-animelib-tv-player-selected');
    });
    selected = element;
    const hoverTarget = element.closest('.fp-quality, .fp-playback-settings') || element;
    hoverTarget.setAttribute('data-animelib-tv-player-selected', 'true');
    try {
      hoverTarget.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
      hoverTarget.dispatchEvent(new MouseEvent('mousemove', {bubbles: true}));
    } catch (_) {}
    const rect = element.getBoundingClientRect();
    const outline = ensureRing();
    Object.assign(outline.style, {
      display: 'block',
      left: Math.max(2, rect.left - 4) + 'px',
      top: Math.max(2, rect.top - 4) + 'px',
      width: Math.max(8, rect.width) + 'px',
      height: Math.max(8, rect.height) + 'px'
    });
    try { element.focus({preventScroll: true}); } catch (_) {}
    return true;
  }

  function video() {
    return Array.from(document.querySelectorAll('video')).find(visible) || null;
  }

  function playerRoot() {
    const media = video();
    return (media && media.closest('[data-video-player]')) || document;
  }

  function playerPresent() {
    return !!video() || !!document.querySelector(
      '.play_button, .play-background, .play_background, .fp-player, [data-video-player], [class*="video-player"], [class*="videoplayer"]'
    );
  }

  function wakeControls() {
    const target = video() || document.querySelector('.fp-player, [class*="player"]') || document.body;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: rect.left + rect.width / 2,
      clientY: Math.max(rect.top, rect.bottom - 36)
    }));
  }

  function controls() {
    const selector = [
      '.play_button', '.fp-pause-icon', '.fp-play-icon', '.fp-quality',
      '.fp-playback-settings', '.fp-volume-icon-max', '.fp-volume-icon-muted',
      '.fp-x-fullscreen', '.fp-to-fullscreen',
      '[data-play]', '[data-player-ui="footer"] .awl_a4',
      '[data-video-subtitles]', '[aria-label="fullscreen"]',
      '.ayv_e', '.menu-item', '.tabs-item',
      'button', 'a[href]', '[role="button"]', '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    return Array.from(playerRoot().querySelectorAll(selector))
      .filter(visible)
      .filter(function (item) {
        return !item.hasAttribute('data-animelib-tv-player-focus') &&
          !item.matches('video, iframe, [data-video-player]');
      });
  }

  function clickInitialPlay() {
    const play = Array.from(playerRoot().querySelectorAll(
      '.play_button, .play-background, .play_background, [class*="play-button"], [data-play], .fp-x-play'
    )).find(visible);
    if (!play) return false;
    play.click();
    return true;
  }

  function togglePlayback() {
    const media = video();
    if (clickInitialPlay()) {
      setTimeout(function () {
        if (media && media.paused) media.play().catch(function () {});
      }, 80);
      return;
    }
    if (!media) return;
    if (media.paused) media.play().catch(function () {});
    else media.pause();
  }

  function seek(delta) {
    const media = video();
    if (!media || !Number.isFinite(media.duration)) return false;
    media.currentTime = Math.max(0, Math.min(media.duration, media.currentTime + delta));
    wakeControls();
    return true;
  }

  function selectBottomControl() {
    wakeControls();
    const items = controls();
    if (!items.length) return false;
    items.sort(function (a, b) {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return br.top - ar.top || ar.left - br.left;
    });
    return mark(items[0]);
  }

  function moveDirectional(direction) {
    wakeControls();
    const items = controls();
    if (!items.length) return false;
    if (!selected || !visible(selected) || items.indexOf(selected) < 0) {
      return selectBottomControl();
    }
    const from = selected.getBoundingClientRect();
    const fromX = from.left + from.width / 2;
    const fromY = from.top + from.height / 2;
    let best = null;
    let score = Infinity;
    items.forEach(function (item) {
      if (item === selected) return;
      const rect = item.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - fromX;
      const dy = rect.top + rect.height / 2 - fromY;
      const horizontal = direction === 'left' || direction === 'right';
      const primary = direction === 'left' ? -dx : direction === 'right' ? dx :
        direction === 'up' ? -dy : dy;
      if (primary <= 3) return;
      const cross = horizontal ? Math.abs(dy) : Math.abs(dx);
      const candidate = Math.abs(primary) + cross * 2.8;
      if (candidate < score) { score = candidate; best = item; }
    });
    return best ? mark(best) : false;
  }

  function activateSelected() {
    wakeControls();
    if (selected && selected.isConnected) {
      const fullscreenControl = selected.matches('.fp-x-fullscreen, .fp-to-fullscreen, [aria-label="fullscreen"]') ||
        selected.closest('.fp-x-fullscreen, .fp-to-fullscreen, [aria-label="fullscreen"]') ||
        selected.querySelector('[data-icon="expand"], .fa-expand');
      if (fullscreenControl) {
        if (window.AnimeLibTvNative) {
          if (window.top === window) window.AnimeLibTvNative.toggleVideoFullscreen();
          else window.AnimeLibTvNative.toggleFrameFullscreen();
        }
        return true;
      }
    }
    if (selected && visible(selected)) {
      const nested = selected.matches('.fp-quality, .fp-playback-settings')
        ? Array.from(selected.querySelectorAll('[role="button"], [tabindex]:not([tabindex="-1"])')).filter(visible)
        : [];
      if (nested.length) {
        return mark(nested.find(function (item) { return item.classList.contains('current'); }) || nested[0]);
      }
      const clicked = selected;
      const before = new Set(controls());
      selected.click();
      setTimeout(function () {
        wakeControls();
        const opened = controls().filter(function (item) {
          return item !== clicked && !before.has(item);
        });
        if (!opened.length) {
          if (!clicked.isConnected || !visible(clicked)) selectBottomControl();
          return;
        }
        const from = clicked.getBoundingClientRect();
        const fromX = from.left + from.width / 2;
        const fromY = from.top + from.height / 2;
        opened.sort(function (a, b) {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          const ad = Math.hypot(ar.left + ar.width / 2 - fromX, ar.top + ar.height / 2 - fromY);
          const bd = Math.hypot(br.left + br.width / 2 - fromX, br.top + br.height / 2 - fromY);
          return ad - bd;
        });
        mark(opened[0]);
      }, 100);
      return true;
    }
    togglePlayback();
    return true;
  }

  function handle(command) {
    if (!playerPresent()) return false;
    if (command === 'activate') {
      activateSelected();
    } else if (command === 'left') {
      if (selected) moveDirectional('left');
      else seek(-10);
    } else if (command === 'right') {
      if (selected) moveDirectional('right');
      else seek(10);
    } else if (command === 'down') {
      if (!selected) selectBottomControl();
      else moveDirectional('down');
    } else if (command === 'up') {
      if (!selected || !moveDirectional('up')) {
        selected = null;
        if (ring) ring.style.display = 'none';
        wakeControls();
      }
    } else {
      return false;
    }
    return true;
  }

  function handleKey(event) {
    const code = event.key || event.code;
    const command = code === 'Enter' || code === 'NumpadEnter' || code === ' ' ||
      code === 'MediaPlayPause' || event.keyCode === 23 || event.keyCode === 85 ? 'activate' :
      code === 'ArrowLeft' || event.keyCode === 21 ? 'left' :
      code === 'ArrowRight' || event.keyCode === 22 ? 'right' :
      code === 'ArrowDown' || event.keyCode === 20 ? 'down' :
      code === 'ArrowUp' || event.keyCode === 19 ? 'up' : null;
    if (!command || !handle(command)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function handleKeyRelease(event) {
    const code = event.key || event.code;
    const handled = code === 'Enter' || code === 'NumpadEnter' || code === ' ' ||
      code === 'MediaPlayPause' || code === 'ArrowLeft' || code === 'ArrowRight' ||
      code === 'ArrowDown' || code === 'ArrowUp' ||
      event.keyCode === 23 || event.keyCode === 85 ||
      event.keyCode === 21 || event.keyCode === 22 ||
      event.keyCode === 20 || event.keyCode === 19;
    if (!handled || !playerPresent()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  ensureStyle();
  window.AnimeLibTvPlayer = {handle: handle};
  addEventListener('keydown', handleKey, true);
  addEventListener('keyup', handleKeyRelease, true);
  addEventListener('resize', function () { if (selected) mark(selected); });
})();
