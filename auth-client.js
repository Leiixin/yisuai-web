/**
 * Supabase Auth 封装。依赖：先加载 CDN @supabase/supabase-js，再加载本文件。
 * 配置来自 auth-config.js 中的 window.__BUTTERFLY_SUPABASE__
 */
(function () {
  var cfg = window.__BUTTERFLY_SUPABASE__;
  var client = null;

  if (
    cfg &&
    cfg.url &&
    cfg.key &&
    cfg.url.indexOf("YOUR_PROJECT") === -1 &&
    cfg.key.indexOf("YOUR_SUPABASE") === -1 &&
    typeof supabase !== "undefined"
  ) {
    try {
      client = supabase.createClient(cfg.url, cfg.key);
    } catch (e1) {
      console.warn("butterfly auth: createClient failed", e1);
    }
  }

  window.__butterflyAuth = {
    getClient: function () {
      return client;
    },
    isConfigured: function () {
      return !!client;
    },
    signInWithPassword: function (email, password) {
      if (!client) {
        return Promise.reject(new Error("未配置 Supabase：请复制 auth-config.example.js 为 auth-config.js 并填写密钥。"));
      }
      return client.auth.signInWithPassword({
        email: String(email || "").trim(),
        password: password,
      });
    },
    signUp: function (email, password) {
      if (!client) {
        return Promise.reject(new Error("未配置 Supabase：请复制 auth-config.example.js 为 auth-config.js 并填写密钥。"));
      }
      return client.auth.signUp({
        email: String(email || "").trim(),
        password: password,
      });
    },
    signOut: function () {
      if (!client) {
        return Promise.resolve();
      }
      /** scope: local 仅清除本机会话，不依赖服务端撤销；global 默认易在网络差时长时间挂起，导致退出按钮无反应 */
      return client.auth.signOut({ scope: "local" }).catch(function () {
        return client.auth.signOut();
      });
    },
    getSession: function () {
      if (!client) {
        return Promise.resolve({ data: { session: null }, error: null });
      }
      return client.auth.getSession();
    },
    onAuthStateChange: function (callback) {
      if (!client) {
        return {
          data: {
            subscription: {
              unsubscribe: function () {},
            },
          },
        };
      }
      return client.auth.onAuthStateChange(callback);
    },
  };
})();
