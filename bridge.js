// Runs in ISOLATED world; bridges chrome.storage to the MAIN-world content.js
// via DOM CustomEvents.
(() => {
  const DEFAULTS = {
    enabled: true,
    position: 'right',
    summaryLength: 20,
    defaultCollapsed: false,
    tooltipEnabled: true,
  };

  function send(settings) {
    document.dispatchEvent(
      new CustomEvent('claude-nav-settings', { detail: settings })
    );
  }

  function load() {
    try {
      chrome.storage.sync.get(DEFAULTS, (items) => {
        send({ ...DEFAULTS, ...items });
      });
    } catch (e) {
      send(DEFAULTS);
    }
  }

  load();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      load();
    });
  } catch (e) {}
})();
