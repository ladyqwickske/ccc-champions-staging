// 🌐 Google Translate button, as on the Champions pages: the widget sits at the
// bottom right; on narrow screens it folds into a 🌐 button. Include once per page:
//   <script src="translate.js"></script>
(function () {
  if (window.__cccTranslate) return;
  window.__cccTranslate = true;

  var css = [
    'body { top: 0 !important; }',
    'html, body { margin-top: 0 !important; }',
    'body.translated-ltr, body.translated-rtl { margin-top: 0 !important; top: 0 !important; }',
    '.goog-te-banner-frame, iframe.goog-te-banner-frame, .goog-te-banner-frame.skiptranslate { display: none !important; visibility: hidden !important; height: 0 !important; }',
    '#goog-gt-tt, .goog-te-balloon-frame { display: none !important; visibility: hidden !important; }',
    '.goog-text-highlight { background: transparent !important; box-shadow: none !important; }',
    '#google_translate_element { position: fixed; bottom: 8px; right: 8px; z-index: 7000; }',
    '#translateToggleBtn { position: fixed; bottom: 8px; right: 8px; z-index: 7001; display: none; align-items: center; justify-content: center;'
      + ' width: 38px; height: 38px; border: 1px solid var(--border, #9fdcf0); border-radius: 8px; background: var(--bg-card, #fff);'
      + ' color: var(--primary, #1fc1e6); font-size: 18px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }',
    '@media (max-width: 800px) {',
    '  #google_translate_element { max-width: 0; overflow: hidden; opacity: 0; pointer-events: none; transition: max-width 0.2s ease, opacity 0.2s ease; }',
    '  body.translate-open #google_translate_element { max-width: 260px; opacity: 1; pointer-events: auto; }',
    '  #translateToggleBtn { display: inline-flex !important; }',
    '}',
  ].join('\n');

  window.googleTranslateElementInit = function () {
    new google.translate.TranslateElement({ pageLanguage: 'en', layout: google.translate.TranslateElement.InlineLayout.SIMPLE }, 'google_translate_element');
  };

  function setUp() {
    if (document.getElementById('google_translate_element')) return;
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var widget = document.createElement('div');
    widget.id = 'google_translate_element';
    var btn = document.createElement('button');
    btn.id = 'translateToggleBtn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle translation');
    btn.textContent = '🌐';
    document.body.appendChild(widget);
    document.body.appendChild(btn);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      document.body.classList.toggle('translate-open');
    });
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('translate-open')) return;
      if (widget.contains(e.target) || btn.contains(e.target)) return;
      document.body.classList.remove('translate-open');
    });

    var s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    document.body.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setUp);
  else setUp();
})();
