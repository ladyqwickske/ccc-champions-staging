// STAGING copy of the site: talks to the staging Worker (database), not the
// live one. Read-only: anything that would change data is refused there, so the
// Google Sheet is only ever changed from the live site.
window.CLOUDFLARE_WORKER_URL = 'https://ccc-db-staging.lady-qwickske.workers.dev/';
window.IS_STAGING_SITE = true;

// Frontend should call the worker to avoid GAS CORS restrictions.
window.GAS_WEB_APP_URL = window.CLOUDFLARE_WORKER_URL;

// Global Google Translate hardening: keep widget bottom-only and suppress top banner/page shift.
(function enforceTranslateLayout() {
	const css = [
		'html, body { margin-top: 0 !important; top: 0 !important; }',
		'body.translated-ltr, body.translated-rtl { margin-top: 0 !important; top: 0 !important; }',
		'.goog-te-banner-frame, iframe.goog-te-banner-frame, .goog-te-banner-frame.skiptranslate { display: none !important; visibility: hidden !important; height: 0 !important; }',
		'#goog-gt-tt, .goog-te-balloon-frame { display: none !important; visibility: hidden !important; }',
		'.goog-text-highlight { background: transparent !important; box-shadow: none !important; }',
		'#google_translate_element, #translateToggleBtn { top: auto !important; right: 8px !important; bottom: 8px !important; }',
		'@media (max-width: 800px) { body { padding-top: max(56px, calc(env(safe-area-inset-top) + 56px)) !important; padding-bottom: max(84px, calc(env(safe-area-inset-bottom) + 84px)) !important; } .tab-nav { top: max(56px, calc(env(safe-area-inset-top) + 56px)) !important; } }'
	].join('\n');

	const injectStyle = function () {
		if (document.getElementById('global-translate-hardening-style')) return;
		const style = document.createElement('style');
		style.id = 'global-translate-hardening-style';
		style.textContent = css;
		document.head.appendChild(style);
	};

	const normalizeTopOffset = function () {
		if (document.documentElement) document.documentElement.style.top = '0px';
		if (document.body) {
			document.body.style.top = '0px';
			document.body.style.marginTop = '0px';
			if (window.matchMedia('(max-width: 800px)').matches) {
				const topPad = 'max(56px, calc(env(safe-area-inset-top) + 56px))';
				const bottomPad = 'max(84px, calc(env(safe-area-inset-bottom) + 84px))';
				document.body.style.setProperty('padding-top', 'max(56px, calc(env(safe-area-inset-top) + 56px))', 'important');
				document.body.style.setProperty('padding-bottom', bottomPad, 'important');
				document.querySelectorAll('.tab-nav').forEach(function (el) {
					el.style.setProperty('top', topPad, 'important');
				});
			}
		}
		const banner = document.querySelector('iframe.goog-te-banner-frame, .goog-te-banner-frame.skiptranslate, .goog-te-banner-frame');
		if (banner) {
			banner.style.display = 'none';
			banner.style.visibility = 'hidden';
			banner.style.height = '0';
		}
		fixMenuFramePosition();
	};

	// The Google Translate language dropdown (.goog-te-menu-frame) computes its own
	// position/height assuming a normally-flowed anchor. Our widget uses position:fixed,
	// so on some browsers the frame ends up clipped/off-screen with no way to scroll to
	// the remaining languages. Force it to a viewport-anchored, capped, scrollable box.
	const fixMenuFramePosition = function () {
		const frame = document.querySelector('iframe.goog-te-menu-frame');
		const anchor = document.getElementById('google_translate_element');
		if (!frame || !anchor) return;
		const rect = anchor.getBoundingClientRect();
		const margin = 8;
		const maxHeight = Math.max(120, rect.top - margin * 2);
		const maxWidth = Math.min(320, window.innerWidth - margin * 2);
		frame.style.setProperty('position', 'fixed', 'important');
		frame.style.setProperty('top', 'auto', 'important');
		frame.style.setProperty('bottom', (window.innerHeight - rect.top + margin) + 'px', 'important');
		frame.style.setProperty('left', 'auto', 'important');
		frame.style.setProperty('right', margin + 'px', 'important');
		frame.style.setProperty('max-height', maxHeight + 'px', 'important');
		frame.style.setProperty('max-width', maxWidth + 'px', 'important');
		frame.style.setProperty('overflow-y', 'auto', 'important');
		frame.style.setProperty('overflow-x', 'hidden', 'important');
	};

	const startObserver = function () {
		if (!document.body || window.__translateLayoutObserverStarted) return;
		window.__translateLayoutObserverStarted = true;
		const observer = new MutationObserver(normalizeTopOffset);
		observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
		normalizeTopOffset();
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function () {
			injectStyle();
			startObserver();
			window.addEventListener('resize', normalizeTopOffset);
		});
	} else {
		injectStyle();
		startObserver();
		window.addEventListener('resize', normalizeTopOffset);
	}
})();

// Staging marker: a small fixed label on every page, so the staging copy is
// never mistaken for the live site. Bottom-left, clear of the translate widget.
(function stagingBadge() {
	const add = function () {
		if (document.getElementById('staging-site-badge')) return;
		const badge = document.createElement('div');
		badge.id = 'staging-site-badge';
		badge.textContent = 'STAGING \u2014 read-only';
		badge.title = 'Test copy of the site using the new database. Make changes on the live site.';
		badge.style.cssText = [
			'position:fixed', 'left:8px', 'bottom:8px', 'z-index:2147483647',
			'background:#c62828', 'color:#fff', 'font:700 12px/1.2 Arial,sans-serif',
			'padding:6px 10px', 'border-radius:6px', 'box-shadow:0 2px 6px rgba(0,0,0,.35)',
			'letter-spacing:.5px', 'pointer-events:auto', 'opacity:.92'
		].join(';');
		document.body.appendChild(badge);
	};
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
	else add();
})();
