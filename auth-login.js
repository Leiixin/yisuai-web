/**
 * login.html：邮箱注册 / 登录
 */
(function () {
  var auth = window.__butterflyAuth;

  function $(id) {
    return document.getElementById(id);
  }

  function showError(el, msg) {
    if (!el) {
      return;
    }
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  function setBusy(busy, btnIn, btnUp) {
    [btnIn, btnUp].forEach(function (b) {
      if (b) {
        b.disabled = !!busy;
      }
    });
  }

  function redirectIfSession() {
    if (!auth || !auth.isConfigured()) {
      return;
    }
    auth.getSession().then(function (res) {
      if (res && res.data && res.data.session) {
        window.location.replace("index.html");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    redirectIfSession();

    var err = $("auth-account-error");
    var emailEl = $("auth-email");
    var passEl = $("auth-password");
    var btnIn = $("auth-signin");
    var btnUp = $("auth-signup");

    if (!auth || !auth.isConfigured()) {
      showError(
        err,
        "未配置 Supabase：请将 auth-config.example.js 复制为 auth-config.js，并填入 Project URL 与 anon/publishable key。"
      );
      if (btnIn) {
        btnIn.disabled = true;
      }
      if (btnUp) {
        btnUp.disabled = true;
      }
      return;
    }

    function mapAuthMessage(raw) {
      if (!raw) {
        return "操作失败，请稍后重试。";
      }
      var s = String(raw).toLowerCase();
      if (s.indexOf("invalid login credentials") !== -1 || s.indexOf("invalid_credentials") !== -1) {
        return "邮箱或密码不正确。";
      }
      if (s.indexOf("user already registered") !== -1 || s.indexOf("already registered") !== -1) {
        return "该邮箱已注册，请直接登录。";
      }
      if (s.indexOf("password") !== -1 && s.indexOf("least") !== -1) {
        return "密码长度不符合项目要求，请换一个更强的密码。";
      }
      return String(raw);
    }

    function doSignIn() {
      showError(err, "");
      var email = (emailEl && emailEl.value) || "";
      var pass = (passEl && passEl.value) || "";
      if (!email.trim() || !pass) {
        showError(err, "请输入邮箱与密码。");
        return;
      }
      setBusy(true, btnIn, btnUp);
      auth
        .signInWithPassword(email, pass)
        .then(function (res) {
          if (res.error) {
            showError(err, mapAuthMessage(res.error.message));
            return;
          }
          window.location.href = "index.html";
        })
        .catch(function (e) {
          showError(err, mapAuthMessage(e && e.message));
        })
        .finally(function () {
          setBusy(false, btnIn, btnUp);
        });
    }

    function doSignUp() {
      showError(err, "");
      var email = (emailEl && emailEl.value) || "";
      var pass = (passEl && passEl.value) || "";
      if (!email.trim() || !pass) {
        showError(err, "请输入邮箱与密码。");
        return;
      }
      setBusy(true, btnIn, btnUp);
      auth
        .signUp(email, pass)
        .then(function (res) {
          if (res.error) {
            showError(err, mapAuthMessage(res.error.message));
            return;
          }
          if (res.data && res.data.user && !res.data.session) {
            showError(
              err,
              "注册成功。若项目在控制台开启了邮箱验证，请查收邮件完成验证后再登录。"
            );
            return;
          }
          window.location.href = "index.html";
        })
        .catch(function (e) {
          showError(err, mapAuthMessage(e && e.message));
        })
        .finally(function () {
          setBusy(false, btnIn, btnUp);
        });
    }

    var formAccount = document.getElementById("panel-account");
    if (formAccount) {
      formAccount.addEventListener("submit", function (e) {
        e.preventDefault();
        doSignIn();
      });
    }
    if (btnUp) {
      btnUp.addEventListener("click", function (e) {
        e.preventDefault();
        doSignUp();
      });
    }
  });
})();
