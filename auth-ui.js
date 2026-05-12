/**
 * 主站侧栏用户区：会话展示与 Auth 状态监听。
 */
(function () {
  var PROFILE_KEY = "butterfly_settings_profile_v1";

  function getProfileObject() {
    try {
      var raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (e0) {
      return null;
    }
  }

  function getProfileAvatarDataUrl() {
    var o = getProfileObject();
    if (o && typeof o.avatarDataUrl === "string" && o.avatarDataUrl.indexOf("data:") === 0) {
      return o.avatarDataUrl;
    }
    return "";
  }

  /** 侧栏主行：有昵称用昵称，否则用登录邮箱，否则「本地用户」 */
  function getSidebarDisplayName(email) {
    var o = getProfileObject();
    if (o && o.nickname && String(o.nickname).trim()) {
      return String(o.nickname).trim();
    }
    if (email) {
      return email;
    }
    return "本地用户";
  }

  function syncSidebarAvatar() {
    var url = getProfileAvatarDataUrl();
    var bar = document.getElementById("app-user-bar-avatar");
    var barWrap = document.getElementById("app-user-bar-avatar-wrap");
    var menu = document.getElementById("app-user-menu-avatar");
    var menuWrap = document.getElementById("app-user-menu-avatar-wrap");
    if (url) {
      if (bar) {
        bar.src = url;
        bar.removeAttribute("hidden");
      }
      if (barWrap) {
        barWrap.classList.add("app-user__avatar--has-photo");
      }
      if (menu) {
        menu.src = url;
        menu.removeAttribute("hidden");
      }
      if (menuWrap) {
        menuWrap.classList.add("app-user-menu__avatar--has-photo");
      }
    } else {
      if (bar) {
        bar.removeAttribute("src");
        bar.setAttribute("hidden", "");
      }
      if (barWrap) {
        barWrap.classList.remove("app-user__avatar--has-photo");
      }
      if (menu) {
        menu.removeAttribute("src");
        menu.setAttribute("hidden", "");
      }
      if (menuWrap) {
        menuWrap.classList.remove("app-user-menu__avatar--has-photo");
      }
    }
  }

  window.__butterflySyncSidebarAvatar = syncSidebarAvatar;

  function syncUserChrome(session) {
    var email = session && session.user && session.user.email;
    var display = getSidebarDisplayName(email);
    var names = document.querySelectorAll(".app-user__name");
    var menuName = document.querySelector(".app-user-menu__name");
    var meta = document.querySelector("#app-user-trigger .app-user__meta");
    var trigger = document.getElementById("app-user-trigger");
    names.forEach(function (el) {
      el.textContent = display;
    });
    if (menuName) {
      menuName.textContent = display;
    }
    if (email) {
      if (meta) {
        meta.textContent = "已登录";
      }
      if (trigger) {
        trigger.setAttribute(
          "title",
          "登录邮箱 " +
            email +
            "。点按打开：主题、设置、联系我们、退出登录。已登录时「我的技能」可同步至云端。"
        );
      }
    } else {
      if (meta) {
        meta.innerHTML =
          '未登录账号 <span class="app-user__meta-cta" aria-hidden="true">点按打开菜单</span>';
      }
      if (trigger) {
        trigger.setAttribute(
          "title",
          "点按打开：主题、设置、联系我们、登录或退出。数据仅保存在本机、不上传。"
        );
      }
    }
    syncSidebarAvatar();
  }

  window.__butterflyAuthSync = function () {
    var auth = window.__butterflyAuth;
    if (!auth || !auth.isConfigured()) {
      syncUserChrome(null);
      return;
    }
    function syncFromSession(res) {
      if (res && res.error) {
        console.warn("butterfly auth sync getSession", res.error);
      }
      var sess = res && res.data && res.data.session;
      function afterPull() {
        syncUserChrome(sess);
        var pr = typeof window.__skillsCloudRefresh === "function" ? window.__skillsCloudRefresh() : null;
        Promise.resolve(pr)
          .catch(function (eSk) {
            console.warn("butterfly auth sync skills refresh", eSk);
          })
          .then(function () {
            if (sess && typeof window.__agentUrlsSyncAllSkillsToCloudOnce === "function") {
              return window.__agentUrlsSyncAllSkillsToCloudOnce();
            }
            return undefined;
          })
          .catch(function (eBulk) {
            console.warn("butterfly auth sync bulk skills", eBulk);
          });
      }
      if (sess && typeof window.__profileCloudPull === "function") {
        window.__profileCloudPull().then(afterPull).catch(afterPull);
      } else {
        afterPull();
      }
    }
    auth.getSession().then(function (res) {
      syncFromSession(res);
      var sess = res && res.data && res.data.session;
      if (!sess && !(res && res.error)) {
        window.setTimeout(function () {
          auth.getSession().then(syncFromSession);
        }, 80);
      }
    });
  };

  function bindAuthListener() {
    var auth = window.__butterflyAuth;
    if (auth && auth.onAuthStateChange) {
      auth.onAuthStateChange(function () {
        window.__butterflyAuthSync();
      });
    }
  }

  function onReady() {
    bindAuthListener();
    if (typeof window.__butterflyAuthSync === "function") {
      window.__butterflyAuthSync();
    } else {
      syncSidebarAvatar();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
