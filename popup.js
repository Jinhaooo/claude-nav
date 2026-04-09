const DEFAULTS = {
  enabled: true,
  position: 'right',
  summaryLength: 20,
  defaultCollapsed: false,
  tooltipEnabled: true,
};

function flashSaved(key) {
  const el = document.querySelector(`.saved[data-for="${key}"]`);
  if (!el) return;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 900);
}

function save(key, value) {
  chrome.storage.sync.set({ [key]: value }, () => flashSaved(key));
}

function render(settings) {
  document.querySelectorAll('.toggle[data-key]').forEach((el) => {
    const key = el.dataset.key;
    el.classList.toggle('on', !!settings[key]);
  });
  document.querySelectorAll('select[data-key]').forEach((el) => {
    const key = el.dataset.key;
    el.value = String(settings[key]);
  });
}

function bind() {
  document.querySelectorAll('.toggle[data-key]').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      const next = !el.classList.contains('on');
      el.classList.toggle('on', next);
      save(key, next);
    });
  });
  document.querySelectorAll('select[data-key]').forEach((el) => {
    el.addEventListener('change', () => {
      const key = el.dataset.key;
      let v = el.value;
      if (key === 'summaryLength') v = parseInt(v, 10);
      save(key, v);
    });
  });
}

chrome.storage.sync.get(DEFAULTS, (items) => {
  render({ ...DEFAULTS, ...items });
  bind();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  chrome.storage.sync.get(DEFAULTS, (items) => render({ ...DEFAULTS, ...items }));
});
