(() => {
  const STORAGE_KEY = 'wbatePageTransition';
  const html = document.documentElement;
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  try {
    const entering = sessionStorage.getItem(STORAGE_KEY);
    if (entering === 'forward' || entering === 'back') {
      html.classList.add(`wb-enter-${entering}`);
      sessionStorage.removeItem(STORAGE_KEY);
      window.setTimeout(() => html.classList.remove(`wb-enter-${entering}`), reduceMotion() ? 0 : 340);
    }
  } catch (_) {}

  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-page-transition]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || link.target === '_blank') return;

    const direction = link.dataset.pageTransition === 'forward' ? 'forward' : 'back';
    event.preventDefault();

    try { sessionStorage.setItem(STORAGE_KEY, direction); } catch (_) {}
    if (!reduceMotion()) {
      document.body.classList.add(`wb-page-exit-${direction}`);
      link.classList.add('is-transitioning');
    }

    window.setTimeout(() => { window.location.href = href; }, reduceMotion() ? 0 : 200);
  });

  window.addEventListener('pageshow', () => {
    document.body.classList.remove('wb-page-exit-forward', 'wb-page-exit-back');
  });
})();
