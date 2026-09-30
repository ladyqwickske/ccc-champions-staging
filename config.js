// cCc Legends — STAGING copy of the site (test copy on the database Worker).
// The database Worker: https://legends-db.ccc-hq.com
//   - reads come from the Legends Apps Script (the Google Sheet) until each page
//     has been moved to the database (D1_ACTIONS in the Worker's wrangler.toml);
//   - changes are refused here: the Sheet is only changed from the live site.
// The live site still uses https://ccc-legends.lady-qwickske.workers.dev/
window.CLOUDFLARE_WORKER_URL = 'https://legends-db.ccc-hq.com/';
window.IS_STAGING_SITE = true;

// Frontend should call the worker to avoid GAS CORS restrictions.
window.GAS_WEB_APP_URL = window.CLOUDFLARE_WORKER_URL;

// Sign-in pass (the Worker's src/auth.js), as on the Champions site.
// After a Google sign-in the Worker answers with its own pass, valid 30 days and
// renewed while the site is used. It is kept in this browser and sent with every
// request to the Worker, so officers stay signed in between visits; changes and
// officer-only pages need it. Every page's own login code keeps working as is:
// this only watches the requests to the Worker.
// (The Legends pages keep their login in 'leg_auth' as { email, allowed }.)
(function signInPass() {
	var SESSION_KEY = 'leg_session';
	var SESSION_EMAIL_KEY = 'leg_session_email';
	var SESSION_EXPIRES_KEY = 'leg_session_expires';
	var PAGE_AUTH_KEY = 'leg_auth';
	var LOGIN_KEYS = ['leg_auth', 'leg_portal_role', 'leg_portal_member'];
	var DAYS_30 = 30 * 24 * 3600 * 1000;

	function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
	function set(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
	function pageEmail() {
		try { return String((JSON.parse(get(PAGE_AUTH_KEY) || '{}') || {}).email || '').toLowerCase(); } catch (e) { return ''; }
	}
	function clearPass() { set(SESSION_KEY, ''); set(SESSION_EMAIL_KEY, ''); set(SESSION_EXPIRES_KEY, ''); }
	function clearLogin() { clearPass(); LOGIN_KEYS.forEach(function (k) { set(k, ''); }); }
	function passValid() {
		var exp = Date.parse(get(SESSION_EXPIRES_KEY));
		return !!get(SESSION_KEY) && !(exp && exp < Date.now());
	}

	// On every page load: signed in on the page but no (valid) pass → show as signed
	// out, so the next click on "Login" gets a pass. Signed out on the page → drop the pass.
	(function tidyUp() {
		var email = pageEmail();
		if (email && (!passValid() || get(SESSION_EMAIL_KEY).toLowerCase() !== email)) clearLogin();
		else if (!email && get(SESSION_KEY)) clearPass();
	})();

	// "Logout" on a page removes 'leg_auth': once it was there during this visit
	// and is gone, the pass is dropped too. (While signing in the page asks the
	// Worker first and only then stores 'leg_auth', so a missing key alone must
	// not drop the pass.)
	var seenPageEmail = !!pageEmail();

	var workerBase = String(window.CLOUDFLARE_WORKER_URL || '').replace(/\/+$/, '');
	if (!workerBase || typeof window.fetch !== 'function') return;
	var nativeFetch = window.fetch.bind(window);
	var noticeShown = false;

	function showSignInNotice(message) {
		if (noticeShown) return;
		noticeShown = true;
		var show = function () {
			var box = document.createElement('div');
			box.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:100000;'
				+ 'background:#232526;color:#f3f3f3;border:1px solid #26c2ba;border-radius:10px;padding:12px 16px;'
				+ 'font:14px Roboto,Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:90vw;text-align:center;';
			box.textContent = message + ' ';
			var btn = document.createElement('button');
			btn.textContent = 'OK';
			btn.style.cssText = 'margin-left:10px;background:#26c2ba;color:#232526;border:0;border-radius:6px;padding:4px 12px;font-weight:600;cursor:pointer;';
			btn.onclick = function () { location.reload(); };
			box.appendChild(btn);
			document.body.appendChild(box);
		};
		if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
	}

	window.fetch = function (input, init) {
		var url = typeof input === 'string' ? input : (input && input.url) || '';
		if (String(url).replace(/\/+$/, '').indexOf(workerBase) !== 0) return nativeFetch(input, init);

		init = init ? Object.assign({}, init) : {};
		var headers = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || {});
		var isLogin = false;
		try {
			var body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
			isLogin = !!(body && body.idToken && !body.action);
		} catch (e) {}
		if (pageEmail()) seenPageEmail = true;
		else if (seenPageEmail && !isLogin) { clearPass(); seenPageEmail = false; }   // the page logged out
		if (!isLogin && passValid()) headers.set('X-CCC-Session', get(SESSION_KEY));
		init.headers = headers;

		return nativeFetch(input, init).then(function (res) {
			var renewed = res.headers.get('X-CCC-Session-Renew');
			if (renewed && get(SESSION_KEY)) {
				set(SESSION_KEY, renewed);
				set(SESSION_EXPIRES_KEY, new Date(Date.now() + DAYS_30).toISOString());
			}
			if (isLogin || res.status === 401) {
				return res.clone().json().then(function (data) {
					if (isLogin && data && data.success && data.session) {
						set(SESSION_KEY, data.session);
						set(SESSION_EMAIL_KEY, String(data.email || '').toLowerCase());
						set(SESSION_EXPIRES_KEY, data.sessionExpires || new Date(Date.now() + DAYS_30).toISOString());
					} else if (!isLogin && data && data.authRequired) {
						clearLogin();
						showSignInNotice('Your sign-in has expired. Please sign in again.');
					}
					return res;
				}, function () { return res; });
			}
			return res;
		});
	};
})();

// Staging marker: a small fixed label on every page, so the staging copy is
// never mistaken for the live site.
(function stagingBadge() {
	if (!window.IS_STAGING_SITE) return;
	var add = function () {
		if (document.getElementById('staging-site-badge')) return;
		var badge = document.createElement('div');
		badge.id = 'staging-site-badge';
		badge.textContent = 'LEGENDS STAGING — test copy';
		badge.title = 'Test copy of the cCc Legends site on the database Worker. Changes are disabled here; use the live site.';
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
