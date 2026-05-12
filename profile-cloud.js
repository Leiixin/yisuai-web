/**
 * 个人信息云端：Supabase public.user_profiles。依赖 auth-client 的 __butterflyAuth.getClient()
 * 建表与 RLS 见 supabase/user_profiles_cloud.sql
 */
(function () {
  "use strict";

  var TABLE = "user_profiles";
  var STORAGE_KEY = "butterfly_settings_profile_v1";
  /** 云端头像 data URL 字符上限（过大易触发网关/PostgREST 请求体限制导致 upsert 失败） */
  var MAX_AVATAR_CHARS = 280000;

  function getClient() {
    return window.__butterflyAuth && window.__butterflyAuth.getClient && window.__butterflyAuth.getClient();
  }

  function rowToProfile(row) {
    return {
      nickname: row.nickname || "",
      bio: row.bio || "",
      avatarDataUrl: row.avatar_data_url || "",
    };
  }

  function profileToRow(p, userId) {
    var av = "";
    if (p && typeof p.avatarDataUrl === "string") {
      av = p.avatarDataUrl.length > MAX_AVATAR_CHARS ? p.avatarDataUrl.slice(0, MAX_AVATAR_CHARS) : p.avatarDataUrl;
    }
    return {
      user_id: userId,
      nickname: String((p && p.nickname) || "").trim().slice(0, 32),
      bio: String((p && p.bio) || "").trim().slice(0, 50),
      avatar_data_url: av,
      updated_at: new Date().toISOString(),
    };
  }

  /** 已登录且已配置客户端时：拉取云端行并写入 localStorage；无行则保留本机 */
  window.__profileCloudPull = function () {
    var auth = window.__butterflyAuth;
    var c = getClient();
    if (!c || !auth || !auth.getSession) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    return auth.getSession().then(function (res) {
      if (res && res.error) {
        console.warn("profile cloud pull getSession", res.error);
        return { ok: false, message: res.error.message || String(res.error) };
      }
      var sess = res && res.data && res.data.session;
      var uid = sess && sess.user && sess.user.id;
      if (!uid) {
        return { ok: false, skipped: true };
      }
      return c
        .from(TABLE)
        .select("nickname,bio,avatar_data_url,updated_at")
        .eq("user_id", uid)
        .maybeSingle()
        .then(function (r) {
          if (r.error) {
            console.warn("profile cloud pull", r.error);
            return { ok: false, error: r.error };
          }
          if (!r.data) {
            return { ok: true, empty: true };
          }
          var p = rowToProfile(r.data);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
          } catch (e1) {
            console.warn("profile cloud pull localStorage", e1);
            return { ok: false, error: e1 };
          }
          return { ok: true, profile: p };
        });
    });
  };

  /** 已登录时 upsert 当前用户资料；未登录或未配置则 skipped */
  window.__profileCloudPush = function (p) {
    var auth = window.__butterflyAuth;
    var c = getClient();
    if (!c || !auth || !auth.getSession) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    return auth.getSession().then(function (res) {
      if (res && res.error) {
        console.warn("profile cloud push getSession", res.error);
        return { ok: false, message: res.error.message || String(res.error) };
      }
      var sess = res && res.data && res.data.session;
      var uid = sess && sess.user && sess.user.id;
      if (!uid) {
        return { ok: false, skipped: true };
      }
      var row = profileToRow(p, uid);
      return c
        .from(TABLE)
        .upsert(row, { onConflict: "user_id" })
        .then(function (r2) {
          if (r2 && r2.error) {
            console.warn("profile cloud push", r2.error);
            return {
              ok: false,
              error: r2.error,
              message: r2.error.message || r2.error.code || String(r2.error),
            };
          }
          return { ok: true };
        })
        .catch(function (err) {
          console.warn("profile cloud push network", err);
          return { ok: false, message: (err && err.message) || "网络异常" };
        });
    });
  };
})();
