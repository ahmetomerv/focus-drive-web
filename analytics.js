'use strict';

(() => {
  const key = 'focusdrive.umami-consent.v1';
  const sessionKey = `${key}.blocked`;
  const banner = document.getElementById('analytics-banner');
  const preferences = document.getElementById('analytics-preferences');
  const status = document.getElementById('analytics-status');
  let choice = null;
  let script;
  let loaded = false;
  let lastPath;
  let blocked = false;
  let channel;

  try { blocked = sessionStorage.getItem(sessionKey) === 'true'; } catch { /* Memory still blocks withdrawal. */ }

  function readChoice() {
    try {
      const value = localStorage.getItem(key);
      return value === 'accepted' || value === 'declined' ? value : null;
    } catch { return null; }
  }

  function allowed() {
    return !blocked && choice === 'accepted' && readChoice() === 'accepted';
  }

  function cleanAddress(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin ? url.pathname : url.origin + url.pathname;
    } catch { return ''; }
  }

  // This guard remains active after withdrawal, even if the downloaded tracker
  // is already running. Whitelist basic pageview fields; reject all other data.
  window.focusDriveUmamiBeforeSend = (type, payload) => {
    if (!allowed() || type !== 'event' || payload.name || payload.id || payload.data) return false;
    return {
      website: 'ff05d349-3f70-41d9-94d3-8da8f6d0302e',
      hostname: location.hostname,
      url: location.pathname,
      referrer: cleanAddress(payload.referrer),
      title: document.title,
      language: navigator.language,
      screen: `${screen.width}x${screen.height}`,
    };
  };

  function pageview() {
    if (!loaded || !allowed() || lastPath === location.pathname) return;
    lastPath = location.pathname;
    window.umami.track();
  }

  function start() {
    if (!allowed()) return;
    if (script) { pageview(); return; }
    script = document.createElement('script');
    script.defer = true;
    script.src = 'https://analytics.ahmeto.com/script.js';
    script.dataset.websiteId = 'ff05d349-3f70-41d9-94d3-8da8f6d0302e';
    script.dataset.autoTrack = 'false';
    script.dataset.excludeSearch = 'true';
    script.dataset.excludeHash = 'true';
    script.dataset.performance = 'false';
    script.dataset.beforeSend = 'focusDriveUmamiBeforeSend';
    script.onload = () => { loaded = true; pageview(); };
    script.onerror = () => { script.remove(); script = null; };
    document.head.append(script);
  }

  function showBanner(show) {
    const restoreFocus = !show && banner.contains(document.activeElement);
    banner.hidden = !show;
    preferences.setAttribute('aria-expanded', String(show));
    if (restoreFocus) preferences.focus({ preventScroll: true });
  }

  function apply(value) {
    choice = value;
    if (!allowed()) lastPath = undefined;
    showBanner(!value);
    if (allowed()) start();
  }

  function choose(value) {
    // Block first: never reload into a stale saved acceptance after a failed write.
    blocked = true;
    let saved = false;
    try { localStorage.setItem(key, value); saved = readChoice() === value; } catch { /* Fail closed. */ }
    blocked = value !== 'accepted' || !saved;
    try { sessionStorage.setItem(sessionKey, String(blocked)); } catch { /* Keep the in-memory guard. */ }
    if (value === 'declined') {
      try { channel?.postMessage('declined'); } catch { /* Storage events remain available. */ }
    }
    apply(saved ? value : 'declined');
    status.textContent = saved
      ? (value === 'accepted' ? 'Analytics allowed.' : 'Analytics declined. Tracking is blocked.')
      : 'Your preference could not be saved. Analytics is blocked on this page. You may need to decline again on your next visit.';
  }

  preferences.addEventListener('click', () => {
    showBanner(true);
    banner.querySelector('button').focus();
  });
  banner.querySelector('[data-analytics-allow]').addEventListener('click', () => choose('accepted'));
  banner.querySelector('[data-analytics-decline]').addEventListener('click', () => choose('declined'));

  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    // Re-read current storage rather than trusting a possibly queued old event.
    const value = readChoice();
    blocked = value !== 'accepted';
    try { sessionStorage.setItem(sessionKey, String(blocked)); } catch { /* Memory guard remains. */ }
    apply(value);
  });
  try {
    channel = new BroadcastChannel(key);
    channel.onmessage = event => {
      if (event.data !== 'declined') return;
      blocked = true;
      try { sessionStorage.setItem(sessionKey, 'true'); } catch { /* Memory guard remains. */ }
      apply('declined');
    };
  } catch { /* Saved preferences still synchronize through storage events. */ }

  // Manual pageviews avoid automatic click, performance, or error collection.
  // Gate every navigation, including SPA history changes and bfcache restoration.
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      pageview();
      return result;
    };
  }
  window.addEventListener('popstate', pageview);
  window.addEventListener('pageshow', () => {
    const value = readChoice();
    apply(blocked ? 'declined' : value);
  });
  // Reserve space so the fixed banner never covers footer controls or focus.
  new ResizeObserver(() => {
    document.body.style.paddingBottom = banner.hidden ? '' : `${banner.getBoundingClientRect().height + 32}px`;
  }).observe(banner);
  apply(blocked ? 'declined' : readChoice());
})();
