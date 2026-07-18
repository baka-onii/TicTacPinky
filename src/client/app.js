/**
 * app.js — view router and UI glue.
 * Wires menu → lobby → game transitions and exposes window.App for the other modules.
 */
(function () {
  'use strict';

  const VIEWS = ['menu-view', 'lobby-view', 'game-view'];

  function showView(id) {
    for (const v of VIEWS) {
      document.getElementById(v).classList.toggle('active', v === id);
    }
  }

  let toastTimer = null;
  function toast(message, kind = '') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast show ' + kind;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.className = 'toast ' + kind;
    }, 2800);
  }

  function getQueryMatchId() {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get('match') || params.get('m') || '').toUpperCase();
    return raw;
  }

  function getName() {
    return localStorage.getItem('ttp:name') || '';
  }
  function setName(n) {
    if (n) localStorage.setItem('ttp:name', n);
  }

  function buildShareUrl(matchId) {
    const base = window.location.origin + window.location.pathname;
    return `${base}?match=${matchId}`;
  }

  // ===== Menu wiring =====
  function initMenu() {
    document.getElementById('menu-local').addEventListener('click', () => {
      window.OfflineMode.start();
      showView('game-view');
    });

    document.getElementById('menu-online').addEventListener('click', () => {
      showView('lobby-view');
      // Pre-fill name
      const saved = getName();
      if (saved) {
        document.getElementById('create-name').value = saved;
        document.getElementById('join-name').value = saved;
      }
    });

    const toggleRules = (contentId, btnId) => {
      document.getElementById(btnId).addEventListener('click', () => {
        document.getElementById(contentId).classList.toggle('show');
      });
    };
    toggleRules('rules-content', 'rules-toggle');
    toggleRules('rules-content-game', 'rules-toggle-game');

    document.getElementById('header-menu-btn').addEventListener('click', () => {
      if (confirm('Leave current match and return to menu?')) {
        // Clean URL of any match param
        const url = window.location.origin + window.location.pathname;
        window.history.replaceState({}, '', url);
        showView('menu-view');
      }
    });
  }

  // ===== Lobby wiring =====
  function initLobby() {
    const tabs = document.querySelectorAll('.lobby-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach((t) => t.classList.toggle('active', t === tab));
        document.getElementById('panel-create').classList.toggle('active', target === 'create');
        document.getElementById('panel-join').classList.toggle('active', target === 'join');
        document.getElementById('lobby-error').textContent = '';
      });
    });

    // Auto-uppercase the join code
    const codeInput = document.getElementById('join-code');
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase();
    });

    // Create button
    document.getElementById('create-btn').addEventListener('click', () => {
      const name = document.getElementById('create-name').value.trim();
      const errEl = document.getElementById('lobby-error');
      if (!name) {
        errEl.textContent = 'Please enter a name.';
        return;
      }
      errEl.textContent = '';
      setName(name);
      document.getElementById('create-btn').disabled = true;
      document.getElementById('create-btn').textContent = 'Creating…';
      window.OnlineMode.create(name);
    });

    // Join button
    document.getElementById('join-btn').addEventListener('click', () => {
      const name = document.getElementById('join-name').value.trim();
      const code = document.getElementById('join-code').value.trim().toUpperCase();
      const errEl = document.getElementById('lobby-error');
      if (!name) { errEl.textContent = 'Please enter a name.'; return; }
      if (!code || code.length !== 4) { errEl.textContent = 'Enter a 4-character match code.'; return; }
      errEl.textContent = '';
      setName(name);
      document.getElementById('join-btn').disabled = true;
      document.getElementById('join-btn').textContent = 'Joining…';
      window.OnlineMode.join(code, name);
    });

    // Copy link buttons (wired dynamically when a match exists)
    document.getElementById('copy-link-btn').addEventListener('click', copyShareLink);
    document.getElementById('copy-link-sidebar-btn').addEventListener('click', copyShareLink);
  }

  async function copyShareLink() {
    const matchId = window.OnlineMode.getMatchId();
    if (!matchId) {
      toast('No match to share yet', 'error');
      return;
    }
    const url = buildShareUrl(matchId);
    try {
      await navigator.clipboard.writeText(url);
      toast('Invite link copied!', 'success');
    } catch {
      // Fallback: select the URL text element
      const urlEl = document.getElementById('share-url');
      if (urlEl) {
        const range = document.createRange();
        range.selectNode(urlEl);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        toast('Copy with Ctrl+C', '');
      } else {
        toast(url, '');
      }
    }
  }

  // ===== Online mode callbacks =====
  function onMatchCreated(payload) {
    // Re-enable buttons
    document.getElementById('create-btn').disabled = false;
    document.getElementById('create-btn').textContent = 'Create match';

    const url = buildShareUrl(payload.id);
    document.getElementById('share-url').textContent = url;
    document.getElementById('create-result').style.display = 'block';

    // Update URL so the link the host sees is the same one players can refresh
    window.history.replaceState({}, '', `?match=${payload.id}`);
  }

  function onMatchJoined(payload) {
    // Re-enable buttons and jump to game view
    document.getElementById('join-btn').disabled = false;
    document.getElementById('join-btn').textContent = 'Join match';
    document.getElementById('create-btn').disabled = false;
    document.getElementById('create-btn').textContent = 'Create match';

    window.history.replaceState({}, '', `?match=${payload.id}`);
    showView('game-view');
    // The OnlineMode module will render the board itself when match:state arrives,
    // but we can also trigger an initial render now if state is present.
    // (match:joined already populated the match; emit a render via the module.)
  }

  // ===== Boot =====
  function boot() {
    initMenu();
    initLobby();

    // If the URL already has a match id, jump straight to the lobby's Join panel
    const matchId = getQueryMatchId();
    if (matchId && matchId.length === 4) {
      showView('lobby-view');
      // Switch to Join tab
      document.querySelectorAll('.lobby-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === 'join');
      });
      document.getElementById('panel-create').classList.remove('active');
      document.getElementById('panel-join').classList.add('active');
      document.getElementById('join-code').value = matchId;
      const saved = getName();
      if (saved) {
        document.getElementById('join-name').value = saved;
        document.getElementById('create-name').value = saved;
      }
    }
  }

  const App = {
    toast,
    onMatchCreated,
    onMatchJoined,
    showView,
    buildShareUrl,
  };
  window.App = App;

  document.addEventListener('DOMContentLoaded', boot);
})();
