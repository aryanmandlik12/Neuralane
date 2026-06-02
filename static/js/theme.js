// AI Forge — theme management
// Handles light / dark / auto switching, persistence, and background animations.

const THEME_KEY = 'aiforge-theme';

function resolveTheme(pref) {
  if (pref === 'auto') {
    const h = new Date().getHours();
    return (h >= 6 && h < 19) ? 'light' : 'dark';
  }
  return pref || 'light';
}

function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  // Rebuild background for the resolved theme
  rebuildBackground(resolved);
  // Sync switcher button highlight
  document.querySelectorAll('.ts-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === pref);
  });
}

window.setTheme = function(pref) {
  applyTheme(pref);
  localStorage.setItem(THEME_KEY, pref);
  // Sync to server if logged in
  if (window.AIFORGE_USER_ID) {
    fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: pref })
    }).catch(() => {});
  }
};

// ── Background: clouds (light) / stars (dark) ──────────────────

function rebuildBackground(resolved) {
  const container = document.getElementById('particles');
  if (!container) return;
  container.innerHTML = '';
  if (resolved === 'light') {
    buildClouds(container);
  } else {
    buildStars(container);
  }
}

function buildClouds(container) {
  const clouds = [
    { w: 240, h: 68, top:  7, dur: 40, delay:   0, op: 0.60 },
    { w: 340, h: 90, top: 16, dur: 58, delay: -20, op: 0.42 },
    { w: 170, h: 52, top: 28, dur: 44, delay:  -9, op: 0.48 },
    { w: 280, h: 75, top: 42, dur: 52, delay: -33, op: 0.35 },
    { w: 190, h: 58, top: 58, dur: 38, delay: -24, op: 0.40 },
  ];
  clouds.forEach(c => {
    const div = document.createElement('div');
    div.className = 'cloud';
    div.style.cssText =
      `width:${c.w}px;height:${c.h}px;top:${c.top}%;` +
      `animation-duration:${c.dur}s;animation-delay:${c.delay}s;opacity:${c.op}`;
    container.appendChild(div);
  });
}

function buildStars(container) {
  // 100 twinkling stars
  for (let i = 0; i < 100; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = (Math.random() * 2 + 0.8).toFixed(1);
    star.style.cssText =
      `width:${size}px;height:${size}px;` +
      `left:${(Math.random()*100).toFixed(1)}%;` +
      `top:${(Math.random()*100).toFixed(1)}%;` +
      `animation-duration:${(Math.random()*3+2).toFixed(1)}s;` +
      `animation-delay:${(Math.random()*5).toFixed(1)}s;`;
    container.appendChild(star);
  }
  // 2 shooting stars
  for (let i = 0; i < 2; i++) {
    const ss = document.createElement('div');
    ss.className = 'shooting-star';
    ss.style.cssText =
      `top:${(Math.random()*35).toFixed(1)}%;` +
      `left:${(Math.random()*25).toFixed(1)}%;` +
      `animation-delay:${(i * 8 + Math.random() * 4).toFixed(1)}s;` +
      `animation-duration:${(Math.random()*1.5+2).toFixed(1)}s;`;
    container.appendChild(ss);
  }
}

// ── Auto mode: re-check every 60 s ────────────────────────────
let _autoInterval;
function startAutoInterval() {
  clearInterval(_autoInterval);
  _autoInterval = setInterval(() => {
    if (localStorage.getItem(THEME_KEY) === 'auto') {
      applyTheme('auto');
    }
  }, 60000);
}

// ── Inject theme switcher ─────────────────────────────────────
function injectSwitcher() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) {
    // Place inline in the dropdown, right after "View Profile"
    const div = document.createElement('div');
    div.className = 'ud-item ud-theme-row';
    div.innerHTML =
      '<span>🎨 Theme</span>' +
      '<div class="ud-theme-btns">' +
        '<button class="ts-btn" data-theme="light" onclick="setTheme(\'light\')" title="Light">☀</button>' +
        '<button class="ts-btn" data-theme="dark"  onclick="setTheme(\'dark\')"  title="Dark">🌙</button>' +
        '<button class="ts-btn" data-theme="auto"  onclick="setTheme(\'auto\')"  title="Auto">⏰</button>' +
      '</div>';
    const viewProfile = [...dropdown.querySelectorAll('.ud-item')]
      .find(el => el.textContent.trim().startsWith('👤'));
    if (viewProfile) {
      viewProfile.parentNode.insertBefore(div, viewProfile.nextSibling);
    } else {
      const lastDivider = [...dropdown.querySelectorAll('.ud-divider')].pop();
      dropdown.insertBefore(div, lastDivider);
    }
  } else {
    // Floating fallback for pages without a user menu (login/register)
    const sw = document.createElement('div');
    sw.className = 'theme-switcher';
    sw.innerHTML =
      '<button class="ts-btn" data-theme="light" onclick="setTheme(\'light\')" title="Light">☀</button>' +
      '<button class="ts-btn" data-theme="dark"  onclick="setTheme(\'dark\')"  title="Dark">🌙</button>' +
      '<button class="ts-btn" data-theme="auto"  onclick="setTheme(\'auto\')"  title="Auto">⏰</button>';
    document.body.appendChild(sw);
  }
}

// ── Init on DOMContentLoaded ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  injectSwitcher();

  // Priority: server-saved pref > localStorage > 'light'
  const serverPref = window.AIFORGE_SAVED_THEME || null;
  const pref = serverPref || localStorage.getItem(THEME_KEY) || 'light';

  // Sync localStorage with server pref so they agree
  if (serverPref) localStorage.setItem(THEME_KEY, serverPref);

  // Apply theme (also rebuilds background)
  applyTheme(pref);

  startAutoInterval();
});
