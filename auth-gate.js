/**
 * 受保护页面：未登录则跳转 login.html。须在 auth-client.js 之后、app.js 之前加载。
 * 配合 index / add-skill 页 <html> 上的 auth-gate-pending 样式，减少内容闪屏。
 */
(function () {
  "use strict";
  var path = (location.pathname || "").toLowerCase();
  if (path.indexOf("login.html") !== -1) {
    return;
  }

  document.documentElement.classList.add("auth-gate-pending");

  var auth = window.__butterflyAuth;
  function goLogin() {
    window.location.replace("login.html");
  }

  if (!auth || !auth.isConfigured || !auth.isConfigured() || !auth.getSession) {
    goLogin();
    return;
  }

  auth
    .getSession()
    .then(function (res) {
      if (res && res.data && res.data.session) {
        document.documentElement.classList.add("auth-gate-ok");
        return;
      }
      goLogin();
    })
    .catch(function () {
      goLogin();
    });
})();
