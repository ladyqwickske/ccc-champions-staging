/**
 * Legends portal role gating.
 *
 * admin  - e-mail listed in ALLOWED_MANAGEMENT_EMAILS, sees management pages
 * member - e-mail linked to one or more active Members rows, sees public pages and My Profile
 */
(function () {
  var AUTH_KEY = 'leg_auth';
  var ROLE_KEY = 'leg_portal_role';
  var MEMBER_KEY = 'leg_portal_member';

  var ADMIN_ONLY_PAGES = [
    'events.html',
    'members.html',
    'warnings.html',
    'profiling.html',
    'bank.html'
  ];

  var roleFetchInFlight = false;

  function store(key, value) {
    try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch (e) {}
  }

  function read(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  function readAuth() {
    try { return JSON.parse(read(AUTH_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function currentPage() {
    var path = window.location.pathname || '';
    var file = path.substring(path.lastIndexOf('/') + 1);
    return (file || 'dashboard.html').toLowerCase();
  }

  window.getPortalRole = function () { return read(ROLE_KEY); };
  window.getPortalMemberName = function () { return read(MEMBER_KEY); };
  window.isPortalAdmin = function () { return read(ROLE_KEY) === 'admin'; };

  function ensureProfileTab() {
    var nav = document.getElementById('navLinks') || document.querySelector('.nav-links');
    if (!nav || document.getElementById('myProfileTabBtn')) return;

    var link = document.createElement('a');
    link.href = 'myprofile.html';
    link.id = 'myProfileTabBtn';
    if (currentPage() === 'myprofile.html') link.className = 'active';
    link.style.display = 'none';
    link.innerHTML = '<img src="member_profile.png" class="nav-icon" alt=""> My Profile';
    nav.appendChild(link);
  }

  function protectedLinks() {
    var selectors = ADMIN_ONLY_PAGES.map(function (href) {
      return '.nav-links a[href="' + href + '"], #navLinks a[href="' + href + '"]';
    });
    return selectors.length ? document.querySelectorAll(selectors.join(',')) : [];
  }

  function applyVisibility() {
    var role = read(ROLE_KEY);
    var hasEmail = !!readAuth().email;
    var isAdmin = role === 'admin';
    var isMember = role === 'member';
    var rolePending = hasEmail && !role;

    ensureProfileTab();

    protectedLinks().forEach(function (el) {
      el.style.display = isAdmin ? '' : 'none';
    });

    var profileTab = document.getElementById('myProfileTabBtn');
    if (profileTab) profileTab.style.display = (isAdmin || isMember) ? '' : 'none';

    if (rolePending) return;
    guardPage(isAdmin);
  }

  function guardPage(isAdmin) {
    var page = currentPage();
    if (isAdmin || ADMIN_ONLY_PAGES.indexOf(page) === -1) return;

    document.body.innerHTML = '<div style="max-width:520px;margin:80px auto;padding:32px;'
      + 'background:rgba(255,255,255,0.95);border:1px solid #55d9f3;border-radius:16px;text-align:center;'
      + 'font-family:Segoe UI,Arial,sans-serif;color:#0b3d59;box-shadow:0 12px 30px rgba(11,61,89,0.12);">'
      + '<h1 style="color:#1fc1e6;font-size:22px;margin-bottom:12px;">Restricted page</h1>'
      + '<p style="color:#076b88;font-size:14px;margin-bottom:20px;">This page is only available to clan superiors.</p>'
      + '<a href="dashboard.html" style="display:inline-block;padding:10px 18px;background:#1fc1e6;color:#fff;'
      + 'border-radius:8px;font-weight:700;text-decoration:none;">Back to dashboard</a> '
      + '<a href="myprofile.html" style="display:inline-block;margin-left:8px;padding:10px 18px;background:#fff49a;'
      + 'color:#c57a00;border-radius:8px;font-weight:700;text-decoration:none;">My Profile</a>'
      + '</div>';
  }

  function normalizeRoleResponse(result) {
    if (result && result.ok && result.data) return result.data;
    return result || {};
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
      .then(function (payload) {
        var result = normalizeRoleResponse(payload);
        if (result && result.success) {
          store(ROLE_KEY, result.role === 'none' ? '' : result.role);
          store(MEMBER_KEY, result.memberName || '');
          var auth = readAuth();
          if (auth.email) {
            auth.role = result.role;
            auth.memberName = result.memberName || '';
            auth.memberNames = result.memberNames || [];
            auth.allowed = result.role === 'admin' || result.role === 'member';
            try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch (e) {}
          }
        }
      })
      .catch(function () {})
      .then(function () {
        roleFetchInFlight = false;
        applyVisibility();
      });
  }

  function syncRole() {
    var auth = readAuth();
    var email = auth.email || '';
    if (!email) {
      store(ROLE_KEY, '');
      store(MEMBER_KEY, '');
      applyVisibility();
      return;
    }

    if (auth.role) {
      store(ROLE_KEY, auth.role === 'none' ? '' : auth.role);
      store(MEMBER_KEY, auth.memberName || '');
    }
    applyVisibility();
    refreshRole(email);
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

  function wrapGoogleCallback() {
    var original = window.handleGoogleCallback;
    if (typeof original !== 'function') return;
    window.handleGoogleCallback = function () {
      var outcome = original.apply(this, arguments);
      Promise.resolve(outcome).then(function () {
        var auth = readAuth();
        store(ROLE_KEY, '');
        store(MEMBER_KEY, '');
        refreshRole(auth.email || '');
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