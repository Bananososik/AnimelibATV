(function () {
  'use strict';

  if (window.top === window || window.__animeLibTvPlayerInstalled) return;
  window.__animeLibTvPlayerInstalled = true;

  let selected = null;
  let ring = null;

  function visible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0 && rect.width > 3 && rect.height > 3;
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
    selected = element;
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

  function playerPresent() {
    return !!video() || !!document.querySelector(
      '.play_button, .play-background, .play_background, .fp-player, [class*="video-player"], [class*="videoplayer"]'
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
      'button', 'a[href]', '[role="button"]', '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    return Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .filter(function (item) { return !item.hasAttribute('data-animelib-tv-player-focus'); });
  }

  function clickInitialPlay() {
    const play = Array.from(document.querySelectorAll(
      '.play_button, .play-background, .play_background, [class*="play-button"]'
    )).find(visible);
    if (!play) return false;
    play.click();
    return true;
  }

  function togglePlayback() {
    if (clickInitialPlay()) return;
    const media = video();
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

  function moveHorizontal(direction) {
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
      if ((direction < 0 && dx >= -3) || (direction > 0 && dx <= 3)) return;
      const candidate = Math.abs(dx) + Math.abs(dy) * 3;
      if (candidate < score) { score = candidate; best = item; }
    });
    return best ? mark(best) : false;
  }

  function activateSelected() {
    if (selected && visible(selected)) {
      selected.click();
      return true;
    }
    togglePlayback();
    return true;
  }

  function handleKey(event) {
    if (!playerPresent()) return;
    const code = event.key || event.code;
    let handled = true;
    if (code === 'Enter' || code === 'NumpadEnter' || code === ' ' ||
        code === 'MediaPlayPause' || event.keyCode === 23 || event.keyCode === 85) {
      activateSelected();
    } else if (code === 'ArrowLeft' || event.keyCode === 21) {
      if (!selected || !moveHorizontal(-1)) seek(-10);
    } else if (code === 'ArrowRight' || event.keyCode === 22) {
      if (!selected || !moveHorizontal(1)) seek(10);
    } else if (code === 'ArrowDown' || event.keyCode === 20) {
      selectBottomControl();
    } else if (code === 'ArrowUp' || event.keyCode === 19) {
      selected = null;
      if (ring) ring.style.display = 'none';
      wakeControls();
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  addEventListener('keydown', handleKey, true);
  addEventListener('resize', function () { if (selected) mark(selected); });
})();
