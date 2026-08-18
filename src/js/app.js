/**
 * DeepSeek Floating Widget Frontend Controller
 */

document.addEventListener('DOMContentLoaded', async function () {
  const calc = new DeepSeekCalculator();
  const api = window.electronAPI;

  let currentMode = 'bar';
  let isPinned = true;
  let previousWindowKind = null;

  // Views
  const viewExpanded = document.getElementById('view-expanded');
  const viewBar = document.getElementById('view-bar');

  // Expanded View Elements
  const heroEl = document.getElementById('hero-status');
  const badgeDot = document.getElementById('badge-dot');
  const badgeText = document.getElementById('badge-text');
  const countTimer = document.getElementById('count-timer');
  const nextPrompt = document.getElementById('next-prompt');
  
  const timelineTrack = document.getElementById('timeline-track');
  const timelineNeedle = document.getElementById('timeline-needle');
  const tzLabel = document.getElementById('tz-label');
  const tzFooterInfo = document.getElementById('tz-footer-info');
  const tzToggleBtns = document.querySelectorAll('.tz-btn');

  const windowsBody = document.getElementById('windows-table-body');
  const ratesStatusHeader = document.getElementById('rates-status-header');

  // Buttons
  const pinBtn = document.getElementById('btn-pin');
  const minimizeBarBtn = document.getElementById('btn-minimize-bar');
  const minimizeTrayBtn = document.getElementById('btn-minimize-tray');
  const closeBtn = document.getElementById('btn-close');
  const barExpandBtn = document.getElementById('btn-bar-expand');

  // Bar View Elements
  const barDot = document.getElementById('bar-dot');
  const barTimer = document.getElementById('bar-timer');
  const barStatus = document.getElementById('bar-status');

  if (api) {
    const config = await api.getConfig();
    if (config) {
      const initMode = (config.mode === 'expanded') ? 'expanded' : 'bar';
      setViewMode(initMode, false);
      if (config.zone) calc.setZone(config.zone);
      if (config.pinned !== undefined) isPinned = config.pinned;
    }

    api.onModeChanged(function (data) {
      if (data && data.mode) {
        setViewMode(data.mode, false);
      }
    });

    api.onStateChanged(function (data) {
      if (data && data.pinned !== undefined) {
        isPinned = data.pinned;
        updatePinUI();
      }
    });
  }

  function setViewMode(mode, notifyMain) {
    if (notifyMain === undefined) notifyMain = true;
    currentMode = mode;
    document.body.setAttribute('data-mode', mode);

    viewExpanded.classList.toggle('active', mode === 'expanded');
    viewBar.classList.toggle('active', mode === 'bar');

    if (notifyMain && api) {
      api.setMode(mode);
    }
  }

  function updatePinUI() {
    if (pinBtn) {
      pinBtn.classList.toggle('active', isPinned);
      pinBtn.setAttribute('title', isPinned ? 'Always on Top (Pinned)' : 'Not pinned');
    }
  }

  function renderTimelineTrack() {
    if (!timelineTrack) return;
    timelineTrack.innerHTML = '';
    const segments = calc.getDisplaySegments();
    segments.forEach(function (seg) {
      const div = document.createElement('div');
      div.className = 'seg seg-' + seg.kind;
      div.style.width = ((seg.end - seg.start) / 1440 * 100).toFixed(4) + '%';
      timelineTrack.appendChild(div);
    });
  }

  function renderWindowsTable(now) {
    if (!windowsBody) return;
    windowsBody.innerHTML = '';
    const formatters = calc.getFormatters();
    const timeFmt = formatters.timeFmt;
    const windows = calc.getWindowList(now, 4);

    windows.forEach(function (win) {
      const tr = document.createElement('tr');
      tr.className = 'win-row win-' + win.kind + (win.current ? ' win-current' : '');

      const kindTd = document.createElement('td');
      kindTd.className = 'win-kind';
      kindTd.innerHTML = '<span class="table-dot dot-' + win.kind + '"></span> ' + (win.kind === 'peak' ? 'Peak' : 'Off-Peak');

      const rangeTd = document.createElement('td');
      rangeTd.className = 'win-range';
      rangeTd.textContent = timeFmt.format(win.start) + ' – ' + timeFmt.format(win.end);

      const metaTd = document.createElement('td');
      metaTd.className = 'win-meta';
      metaTd.textContent = win.current
        ? (calc.formatAwayLabel(win.end.getTime() - now.getTime()) + ' left')
        : calc.formatDurationLabel(win.end.getTime() - win.start.getTime());

      tr.appendChild(kindTd);
      tr.appendChild(rangeTd);
      tr.appendChild(metaTd);
      windowsBody.appendChild(tr);
    });
  }

  function updateTzDisplay() {
    const tzStr = calc.zone === 'utc'
      ? 'UTC'
      : (calc.autoDetectedTimezone + ' · ' + calc.getGmtOffsetLabel());

    if (tzLabel) tzLabel.textContent = calc.zone === 'utc' ? 'UTC' : 'Local Time';
    if (tzFooterInfo) tzFooterInfo.textContent = tzStr;

    tzToggleBtns.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-zone') === calc.zone);
    });
  }

  function updateRatesHighlight(isPeak) {
    if (ratesStatusHeader) {
      ratesStatusHeader.textContent = isPeak
        ? 'Paying Now · Peak Rates (Standard)'
        : 'Paying Now · Off-Peak Rates (50% OFF)';
    }

    const rateCards = document.querySelectorAll('.rate-val');
    rateCards.forEach(function (el) {
      const val = isPeak ? el.getAttribute('data-peak') : el.getAttribute('data-off');
      if (val) el.textContent = val;
    });
  }

  function tick() {
    const now = new Date();
    const win = calc.getCurrentUtcWindow(now);
    const isPeak = win.isPeak;
    const remainingMs = win.end.getTime() - now.getTime();
    const countdownStr = calc.formatClock(remainingMs / 1000);
    const formatters = calc.getFormatters();
    const timeZoneFmt = formatters.timeZoneFmt;

    if (previousWindowKind !== null && previousWindowKind !== win.kind) {
      if (api) {
        api.sendNotification({
          title: isPeak ? '🔴 DeepSeek Peak Rates Active' : '🟢 DeepSeek Off-Peak Started (50% OFF)',
          body: isPeak
            ? ('Standard rates active. Off-peak resumes at ' + timeZoneFmt.format(win.end))
            : '50% discount is now active on DeepSeek Flash & DeepSeek Pro!'
        });
      }
    }
    previousWindowKind = win.kind;

    // 1. Full Dashboard View
    if (heroEl) {
      heroEl.className = 'hero-card hero-' + win.kind;
    }
    if (badgeDot) {
      badgeDot.className = 'status-dot dot-' + win.kind;
    }
    if (badgeText) {
      badgeText.textContent = isPeak ? 'PEAK PRICING' : 'OFF-PEAK · 50% DISCOUNT';
    }
    if (countTimer) {
      countTimer.textContent = countdownStr;
    }
    if (nextPrompt) {
      nextPrompt.textContent = '→ ' + (isPeak ? 'Off-peak starts' : 'Peak starts') + ' at ' + timeZoneFmt.format(win.end);
    }

    // 2. Timeline Needle
    if (timelineNeedle) {
      const displayMinute = (win.minuteOfDay + now.getUTCSeconds() / 60 + calc.getDisplayOffset() + 1440) % 1440;
      timelineNeedle.style.left = (displayMinute / 1440 * 100) + '%';
    }

    renderWindowsTable(now);
    updateRatesHighlight(isPeak);

    // 3. Floating Mini Bar with Timer
    if (barDot) {
      barDot.className = 'bar-dot dot-' + win.kind;
    }
    if (barTimer) {
      barTimer.textContent = countdownStr;
    }
    if (barStatus) {
      barStatus.textContent = isPeak ? 'PEAK' : '-50%';
      barStatus.className = 'bar-tag tag-' + win.kind;
    }

    // 4. System Tray in Toolbar
    if (api) {
      api.updateTrayStatus({
        isPeak: isPeak,
        tooltip: 'DeepSeek: ' + (isPeak ? 'PEAK RATES 🔴' : 'OFF-PEAK (50% OFF) 🟢') + ' | ' + countdownStr + ' left'
      });
    }
  }

  // Header Controls
  if (pinBtn) {
    pinBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (api) api.togglePin();
    });
  }

  if (minimizeBarBtn) {
    minimizeBarBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setViewMode('bar', true);
    });
  }

  if (minimizeTrayBtn) {
    minimizeTrayBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setViewMode('tray', true);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (api) api.closeApp();
    });
  }

  // Mini Bar Expand
  if (barExpandBtn) {
    barExpandBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setViewMode('expanded', true);
    });
  }

  if (viewBar) {
    viewBar.addEventListener('dblclick', function () {
      setViewMode('expanded', true);
    });
  }

  // Right-click context menu anywhere
  window.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (api) api.showContextMenu();
  });

  tzToggleBtns.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const nextZone = btn.getAttribute('data-zone');
      calc.setZone(nextZone);
      if (api) api.saveConfig({ zone: nextZone });
      updateTzDisplay();
      renderTimelineTrack();
      tick();
    });
  });

  updatePinUI();
  updateTzDisplay();
  renderTimelineTrack();
  tick();
  setInterval(tick, 1000);
});
