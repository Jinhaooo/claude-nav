(() => {
  const LOG = '[ClaudeNav]';
  const USER_SEL = '[data-testid="user-message"]';
  const ASST_SEL = '.font-claude-message, .font-claude-response, [data-testid="assistant-message"]';

  // ============================================================
  // Settings
  // ============================================================
  const settings = {
    enabled: true,
    position: 'right',
    summaryLength: 20,
    defaultCollapsed: false,
    tooltipEnabled: true,
  };
  let settingsInitialized = false;

  document.addEventListener('claude-nav-settings', (e) => {
    Object.assign(settings, e.detail || {});
    if (!settingsInitialized) {
      settingsInitialized = true;
      collapsed = !!settings.defaultCollapsed;
    }
    render();
  });

  // ============================================================
  // Scan module — find conversation messages and observe changes
  // ============================================================
  window.__claudeNavMessages = [];

  let containerObserver = null;
  let currentContainer = null;
  let lastUrl = location.href;

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // Only render on actual conversation detail pages.
  function isConversationPage() {
    return /\/(chat|project|chats)\/[^/]+/.test(location.pathname);
  }

  function isStreaming() {
    return !!document.querySelector('[data-is-streaming="true"]');
  }

  function countMsgs(node) {
    if (!node || !node.querySelectorAll) return 0;
    return node.querySelectorAll(USER_SEL).length + node.querySelectorAll(ASST_SEL).length;
  }

  function findContainer() {
    const seed = document.querySelector(USER_SEL) || document.querySelector(ASST_SEL);
    if (!seed) return null;
    let node = seed.parentElement;
    let best = node;
    let bestCount = countMsgs(node);
    while (node && node !== document.body && node.parentElement) {
      node = node.parentElement;
      const c = countMsgs(node);
      if (c > bestCount) {
        bestCount = c;
        best = node;
      }
    }
    return best;
  }

  function extractMessages() {
    const userEls = document.querySelectorAll(USER_SEL);
    const asstEls = document.querySelectorAll(ASST_SEL);
    const all = [];
    userEls.forEach((el) => all.push({ role: 'user', element: el }));
    asstEls.forEach((el) => all.push({ role: 'assistant', element: el }));
    all.sort((a, b) => {
      if (a.element === b.element) return 0;
      const pos = a.element.compareDocumentPosition(b.element);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    return all.map((m, i) => {
      const text = (m.element.innerText || m.element.textContent || '').trim();
      return {
        role: m.role,
        summary: text.replace(/\s+/g, ' ').slice(0, 30),
        element: m.element,
        index: i,
      };
    });
  }

  // Use longer debounce while streaming so we don't thrash during token output.
  let scanTimer = null;
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(runScan, isStreaming() ? 800 : 250);
  }

  function runScan() {
    if (!isConversationPage()) {
      if (window.__claudeNavMessages.length) {
        window.__claudeNavMessages = [];
        window.dispatchEvent(new CustomEvent('claude-nav-updated'));
      }
      return;
    }
    const container = findContainer();
    if (!container) {
      if (window.__claudeNavMessages.length) {
        window.__claudeNavMessages = [];
        window.dispatchEvent(new CustomEvent('claude-nav-updated'));
      }
      return;
    }
    if (container !== currentContainer) {
      currentContainer = container;
      if (containerObserver) containerObserver.disconnect();
      containerObserver = new MutationObserver(scheduleScan);
      containerObserver.observe(container, { childList: true, subtree: true });
    }
    const msgs = extractMessages();
    window.__claudeNavMessages = msgs;
    try { document.documentElement.__claudeNavMessages = msgs; } catch (e) {}
    window.dispatchEvent(new CustomEvent('claude-nav-updated'));
  }

  function resetForNavigation() {
    currentContainer = null;
    if (containerObserver) {
      containerObserver.disconnect();
      containerObserver = null;
    }
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
    visibleSet = new Set();
    elementToItem = new WeakMap();
    window.__claudeNavMessages = [];
    scheduleScan();
  }

  function checkUrl() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      resetForNavigation();
    }
  }

  window.addEventListener('popstate', checkUrl);
  ['pushState', 'replaceState'].forEach((m) => {
    const orig = history[m];
    history[m] = function (...args) {
      const r = orig.apply(this, args);
      setTimeout(checkUrl, 0);
      return r;
    };
  });

  const bodyObserver = new MutationObserver(() => {
    checkUrl();
    if (!currentContainer || !document.contains(currentContainer)) scheduleScan();
  });
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleScan);
  } else {
    scheduleScan();
  }

  // ============================================================
  // UI module — nav root, items, tooltip, highlight
  // ============================================================
  let navRoot = null;
  let navList = null;
  let collapsed = false;
  let tipEl = null;
  let tipHideTimer = null;
  let intersectionObserver = null;
  let visibleSet = new Set();
  let elementToItem = new WeakMap();

  function ensureTip() {
    if (tipEl && document.body.contains(tipEl)) return;
    tipEl = document.createElement('div');
    tipEl.className = 'cn-tip';
    tipEl.addEventListener('mouseenter', () => clearTimeout(tipHideTimer));
    tipEl.addEventListener('mouseleave', scheduleHideTip);
    document.body.appendChild(tipEl);
  }

  function showTip(item) {
    if (collapsed || !settings.tooltipEnabled) return;
    clearTimeout(tipHideTimer);
    ensureTip();
    tipEl.classList.toggle('cn-theme-dark', navRoot.classList.contains('cn-theme-dark'));
    tipEl.classList.toggle('cn-theme-light', navRoot.classList.contains('cn-theme-light'));
    tipEl.textContent = item.dataset.cnTip || '';
    tipEl.classList.add('cn-tip-visible');
    const r = item.getBoundingClientRect();
    const tr = tipEl.getBoundingClientRect();
    let top = r.top + r.height / 2 - tr.height / 2;
    top = Math.max(8, Math.min(window.innerHeight - tr.height - 8, top));
    const left = Math.max(8, r.left - tr.width - 10);
    tipEl.style.top = `${top}px`;
    tipEl.style.left = `${left}px`;
    tipEl.style.setProperty('--cn-arrow-y', `${r.top + r.height / 2 - top}px`);
  }

  function scheduleHideTip() {
    clearTimeout(tipHideTimer);
    tipHideTimer = setTimeout(() => {
      if (tipEl) tipEl.classList.remove('cn-tip-visible');
    }, 120);
  }

  function findScrollContainer(fromEl) {
    let node = fromEl?.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      const oy = style.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 4) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function updateHighlight() {
    if (!navList) return;
    let best = null;
    let bestScore = Infinity;
    visibleSet.forEach((el) => {
      const top = el.getBoundingClientRect().top;
      const score = top >= 0 ? top : Math.abs(top) + 10000;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    });
    navList.querySelectorAll('.cn-item.cn-active').forEach((n) => n.classList.remove('cn-active'));
    if (!best) return;
    const item = elementToItem.get(best);
    if (!item) return;
    item.classList.add('cn-active');
    const navRect = navRoot.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < navRect.top || itemRect.bottom > navRect.bottom) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }

  function ensureNavRoot() {
    if (navRoot && document.body.contains(navRoot)) return;
    navRoot = document.createElement('div');
    navRoot.className = 'cn-root';
    navRoot.innerHTML = `
      <div class="cn-header">
        <span class="cn-logo">C</span>
        <button class="cn-toggle" type="button" title="折叠/展开">«</button>
      </div>
      <div class="cn-list"></div>
    `;
    document.body.appendChild(navRoot);
    navList = navRoot.querySelector('.cn-list');
    navRoot.querySelector('.cn-toggle').addEventListener('click', () => {
      collapsed = !collapsed;
      navRoot.classList.toggle('cn-collapsed', collapsed);
      navRoot.querySelector('.cn-toggle').textContent = collapsed ? '»' : '«';
      if (collapsed && tipEl) tipEl.classList.remove('cn-tip-visible');
    });
  }

  function hideNav() {
    if (!navRoot) return;
    navRoot.classList.remove('cn-visible');
    if (tipEl) tipEl.classList.remove('cn-tip-visible');
  }

  function render() {
    if (!settings.enabled || !isConversationPage()) {
      hideNav();
      return;
    }
    const msgs = window.__claudeNavMessages || [];
    const userMsgs = msgs.filter((m) => m.role === 'user');
    if (!userMsgs.length) {
      hideNav();
      return;
    }
    ensureNavRoot();
    navRoot.classList.add('cn-visible');
    navRoot.classList.toggle('cn-pos-left', settings.position === 'left');
    navRoot.classList.toggle('cn-pos-right', settings.position !== 'left');
    navRoot.classList.toggle('cn-collapsed', collapsed);
    const toggleBtn = navRoot.querySelector('.cn-toggle');
    if (toggleBtn) toggleBtn.textContent = collapsed ? '»' : '«';

    // Batch insert items via DocumentFragment for perf on long conversations.
    const frag = document.createDocumentFragment();
    elementToItem = new WeakMap();
    userMsgs.forEach((m, i) => {
      const item = document.createElement('div');
      item.className = 'cn-item cn-user';
      const num = document.createElement('span');
      num.className = 'cn-num';
      num.textContent = String(i + 1);
      const label = document.createElement('span');
      label.className = 'cn-label';
      const text = (m.element.innerText || m.element.textContent || '').trim().replace(/\s+/g, ' ');
      label.textContent = text.slice(0, settings.summaryLength) || 'user';
      item.dataset.cnTip = ((text.split('\n')[0] || text).slice(0, 60)) + (text.length > 60 ? '…' : '');
      item.addEventListener('mouseenter', () => showTip(item));
      item.addEventListener('mouseleave', scheduleHideTip);
      item.addEventListener('click', () => {
        if (m.element && document.contains(m.element)) {
          m.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        item.classList.remove('cn-pulse');
        void item.offsetWidth;
        item.classList.add('cn-pulse');
      });
      item.appendChild(num);
      item.appendChild(label);
      frag.appendChild(item);
      elementToItem.set(m.element, item);
    });
    navList.replaceChildren(frag);

    // (Re)wire IntersectionObserver
    if (intersectionObserver) intersectionObserver.disconnect();
    visibleSet = new Set();
    const scrollRoot = findScrollContainer(userMsgs[0].element);
    intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.3) visibleSet.add(e.target);
        else visibleSet.delete(e.target);
      });
      updateHighlight();
    }, { root: scrollRoot, threshold: [0, 0.3, 0.6, 1] });
    userMsgs.forEach((m) => intersectionObserver.observe(m.element));

    applyTheme();
  }

  window.addEventListener('claude-nav-updated', render);

  // ============================================================
  // Theme detection
  // ============================================================
  function detectTheme() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) return 'dark';
    if (html.classList.contains('light')) return 'light';
    const scheme = html.style.colorScheme || getComputedStyle(html).colorScheme;
    if (scheme && scheme.includes('dark')) return 'dark';
    const bg = getComputedStyle(document.body).backgroundColor;
    const m = bg.match(/\d+/g);
    if (m) {
      const [r, g, b] = m.map(Number);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? 'dark' : 'light';
    }
    return 'dark';
  }

  function applyTheme() {
    if (!navRoot) return;
    const t = detectTheme();
    navRoot.classList.toggle('cn-theme-dark', t === 'dark');
    navRoot.classList.toggle('cn-theme-light', t === 'light');
  }

  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
})();
