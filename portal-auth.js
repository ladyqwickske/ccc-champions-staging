/**
 * PORTAL ROLE GATING
 * ==================
 * Every page keeps its own login code; this layer adds role awareness on top of it.
 *
 *   admin  - e-mail listed in ALLOWED_MANAGEMENT_EMAILS, sees everything
 *   member - e-mail linked to a member on the Members sheet, sees the public pages
 *            plus their own profile
 *
 * It wraps the page's updateLoginUI(), injects the "My Profile" tab and blocks
 * management pages for non-admins.
 */
(function () {
  var ROLE_KEY = 'ccc_portal_role';
  var MEMBER_KEY = 'ccc_portal_member';
  var EMAIL_KEY = 'ccc_portal_google_email';

  var ADMIN_ONLY_PAGES = [
    'events.html',
    'members.html',
    'warnings.html',
    'profiling.html',
    'resources.html',
    'bank.html',
    'compensation.html'
  ];

  var roleFetchInFlight = false;

  function store(key, value) {
    try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch (e) {}
  }

  function read(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  window.getPortalRole = function () { return read(ROLE_KEY); };
  window.getPortalMemberName = function () { return read(MEMBER_KEY); };
  window.isPortalAdmin = function () { return read(ROLE_KEY) === 'admin'; };

  function currentPage() {
    var path = window.location.pathname || '';
    var file = path.substring(path.lastIndexOf('/') + 1);
    return (file || 'dashboard.html').toLowerCase();
  }

  function ensureProfileTab() {
    var tabs = document.getElementById('navTabs') || document.querySelector('.tab-buttons');
    if (!tabs || document.getElementById('myProfileTabBtn')) return;

    var link = document.createElement('a');
    link.href = 'myprofile.html';
    link.id = 'myProfileTabBtn';
    link.className = 'tab-btn' + (currentPage() === 'myprofile.html' ? ' active' : '');
    link.title = 'My Profile';
    link.style.display = 'none';
    link.innerHTML = '<img src="member_profile.png" alt="My Profile" class="tab-icon desktop-only">'
      + '<span class="tab-label mobile-only">My Profile</span>';
    tabs.appendChild(link);
  }

  function applyVisibility() {
    var role = read(ROLE_KEY);
    var isAdmin = role === 'admin';
    var isMember = role === 'member';

    ensureProfileTab();

    ADMIN_ONLY_PAGES.forEach(function (href) {
      document.querySelectorAll('.tab-buttons .tab-btn[href="' + href + '"]').forEach(function (el) {
        el.style.display = isAdmin ? '' : 'none';
      });
    });

    var profileTab = document.getElementById('myProfileTabBtn');
    if (profileTab) profileTab.style.display = (isAdmin || isMember) ? '' : 'none';

    guardPage(isAdmin);
  }

  function guardPage(isAdmin) {
    var page = currentPage();
    if (isAdmin || ADMIN_ONLY_PAGES.indexOf(page) === -1) return;

    document.body.innerHTML = '<div style="max-width:520px;margin:80px auto;padding:32px;'
      + 'background:rgba(30,34,40,0.95);border:1px solid #444;border-radius:16px;text-align:center;'
      + 'font-family:\'Google Sans\',Roboto,Arial,sans-serif;color:#f3f3f3;">'
      + '<h1 style="color:#ffb300;font-size:22px;margin-bottom:12px;">Restricted page</h1>'
      + '<p style="color:#b0b0b0;font-size:14px;margin-bottom:20px;">This page is only available to clan officers.</p>'
      + '<a href="dashboard.html" style="display:inline-block;padding:10px 18px;background:#ffb300;color:#232526;'
      + 'border-radius:6px;font-weight:600;text-decoration:none;">Back to dashboard</a> '
      + '<a href="myprofile.html" style="display:inline-block;margin-left:8px;padding:10px 18px;background:#444;'
      + 'color:#ffb300;border-radius:6px;font-weight:600;text-decoration:none;">My profile</a>'
      + '</div>';
  }

  function refreshRole(email) {
    if (!email || roleFetchInFlight) return;
    roleFetchInFlight = true;
    fetch(window.GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getPortalRole', email: email })
    })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        if (result && result.success) {
          store(ROLE_KEY, result.role === 'none' ? '' : result.role);
          store(MEMBER_KEY, result.memberName || '');
        }
      })
      .catch(function () {})
      .then(function () {
        roleFetchInFlight = false;
        applyVisibility();
      });
  }

  function syncRole() {
    var email = read(EMAIL_KEY);
    if (!email) {
      store(ROLE_KEY, '');
      store(MEMBER_KEY, '');
      applyVisibility();
      return;
    }
    applyVisibility();
    if (!read(ROLE_KEY)) refreshRole(email);
  }

  function wrapUpdateLoginUI() {
    var original = window.updateLoginUI;
    window.updateLoginUI = function () {
      if (typeof original === 'function') {
        try { original.apply(this, arguments); } catch (e) { console.error(e); }
      }
      syncRole();
    };
  }

  // Re-check the role after each successful sign-in so a fresh link is picked up
  function wrapGoogleCallback() {
    var original = window.handleGoogleCallback;
    if (typeof original !== 'function') return;
    window.handleGoogleCallback = function () {
      var outcome = original.apply(this, arguments);
      Promise.resolve(outcome).then(function () {
        store(ROLE_KEY, '');
        refreshRole(read(EMAIL_KEY));
      }).catch(function () {});
      return outcome;
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    wrapUpdateLoginUI();
    wrapGoogleCallback();
    syncRole();
  });
})();
