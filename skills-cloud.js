/**
 * 技能云端：Supabase public.skills 表。依赖 auth-client 的 __butterflyAuth.getClient()
 * 建表与 RLS 见 supabase/skills_cloud.sql
 */
(function () {
  "use strict";

  var TABLE = "skills";
  /** 与 app.js 知识类占位 URL 一致，用于从云端行推断 skillKind（技能商店「网址/知识」分栏） */
  var KNOWLEDGE_URL_PLACEHOLDER = "https://invalid.invalid/knowledge";
  /** 与 app.js MAX_IMAGE_DATA_URL 保持一致：单个技能头像 data URL 上限 */
  var MAX_CARD_IMAGE_CHARS = 2200000;
  /** 单条 JSON 中案例图 data URL 总长度上限，避免请求过大失败 */
  var MAX_IMAGES_JSON_CHARS = 480000;

  function getClient() {
    return window.__butterflyAuth && window.__butterflyAuth.getClient && window.__butterflyAuth.getClient();
  }

  window.__skillsCloudCache = [];

  function slimImages(arr) {
    if (!Array.isArray(arr)) {
      return [];
    }
    var out = [];
    var total = 0;
    for (var i = 0; i < arr.length; i += 1) {
      var s = arr[i];
      if (typeof s !== "string" || s.indexOf("data:image/") !== 0) {
        continue;
      }
      if (s.length > 400000) {
        continue;
      }
      if (total + s.length > MAX_IMAGES_JSON_CHARS) {
        break;
      }
      out.push(s);
      total += s.length;
    }
    return out;
  }

  function itemToRow(item, userId, authorDisplay) {
    return {
      id: String(item.id),
      user_id: userId,
      name: String(item.name || ""),
      url: String(item.url || ""),
      detail_intro: item.detailIntro != null && String(item.detailIntro).length ? String(item.detailIntro) : null,
      featured_cases: item.featuredCases != null && String(item.featuredCases).length ? String(item.featuredCases) : null,
      card_image_data_url:
        item.cardImageDataUrl &&
        typeof item.cardImageDataUrl === "string" &&
        item.cardImageDataUrl.indexOf("data:image/") === 0 &&
        item.cardImageDataUrl.length <= MAX_CARD_IMAGE_CHARS
          ? item.cardImageDataUrl
          : null,
      featured_cases_images: slimImages(item.featuredCasesImages),
      skill_category: item.skillCategory != null && String(item.skillCategory).trim() ? String(item.skillCategory).trim() : null,
      open_source_mode: item.openSourceMode === "yes" || item.openSourceMode === "no" ? item.openSourceMode : null,
      author_display: authorDisplay != null && String(authorDisplay).trim() ? String(authorDisplay).trim() : null,
      created_at: item.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  function rowToItem(r) {
    var imgs = r.featured_cases_images;
    if (!Array.isArray(imgs)) {
      imgs = [];
    }
    var urlStr = String(r.url || "");
    return {
      id: r.id,
      name: r.name,
      url: r.url,
      skillKind: urlStr === KNOWLEDGE_URL_PLACEHOLDER ? "knowledge" : "url",
      createdAt: r.created_at,
      detailIntro: r.detail_intro,
      featuredCases: r.featured_cases,
      cardImageDataUrl:
        r.card_image_data_url &&
        typeof r.card_image_data_url === "string" &&
        r.card_image_data_url.indexOf("data:image/") === 0 &&
        r.card_image_data_url.length <= MAX_CARD_IMAGE_CHARS
          ? r.card_image_data_url
          : "",
      featuredCasesImages: imgs,
      skillCategory: r.skill_category,
      openSourceMode: r.open_source_mode,
      authorDisplay: r.author_display,
      fromCloud: true,
      /** 云端行 user_id，用于「我的技能」仅合并当前账号自己的条目 */
      cloudUserId: r.user_id != null ? String(r.user_id) : null,
    };
  }

  function notifyRender() {
    if (typeof window.__onSkillsCloudCacheUpdated === "function") {
      window.__onSkillsCloudCacheUpdated();
    }
  }

  window.__skillsCloudRefresh = function (done) {
    var c = getClient();
    var arr = window.__skillsCloudCache;
    function finishFromDone() {
      if (typeof done === "function") {
        done();
      }
    }
    if (!c) {
      arr.length = 0;
      window.__skillsCloudSessionUserId = null;
      notifyRender();
      finishFromDone();
      return Promise.resolve();
    }
    return c
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .then(function (res) {
        arr.length = 0;
        if (res.error) {
          console.warn("[skills-cloud] 读取 skills 失败（商店/合并将无云端项）:", res.error.message || res.error);
        } else if (res.data && res.data.length) {
          for (var i = 0; i < res.data.length; i += 1) {
            arr.push(rowToItem(res.data[i]));
          }
        }
        var auth = window.__butterflyAuth;
        function finishRefresh() {
          notifyRender();
          finishFromDone();
        }
        if (!auth || !auth.getSession) {
          window.__skillsCloudSessionUserId = null;
          finishRefresh();
          return undefined;
        }
        return auth.getSession().then(function (sr) {
          if (sr && sr.error) {
            console.warn("[skills-cloud] refresh getSession", sr.error);
          }
          var u = sr && sr.data && sr.data.session && sr.data.session.user && sr.data.session.user.id;
          window.__skillsCloudSessionUserId = u ? String(u) : null;
          finishRefresh();
        });
      })
      .catch(function (err) {
        arr.length = 0;
        console.warn("[skills-cloud] 拉取 skills 异常（网络或客户端）:", err);
        window.__skillsCloudSessionUserId = null;
        notifyRender();
        finishFromDone();
      });
  };

  window.__skillsCloudUpsert = function (item, opts) {
    opts = opts || {};
    var auth = window.__butterflyAuth;
    var c = getClient();
    if (!c || !auth || !item || !item.id) {
      return Promise.resolve();
    }
    return auth.getSession().then(function (res) {
      var sess = res && res.data && res.data.session;
      var uid = sess && sess.user && sess.user.id;
      if (!uid) {
        return null;
      }
      var nick = "";
      try {
        var raw = localStorage.getItem("butterfly_settings_profile_v1");
        if (raw) {
          var o = JSON.parse(raw);
          if (o && o.nickname && String(o.nickname).trim()) {
            nick = String(o.nickname).trim();
          }
        }
      } catch (e1) {}
      var row = itemToRow(item, uid, nick);
      return c
        .from(TABLE)
        .upsert(row, { onConflict: "id" })
        .then(function (ur) {
          if (ur && ur.error) {
            console.warn("[skills-cloud] upsert 失败（技能未写入云端）:", ur.error.message || ur.error);
            return;
          }
          if (!opts.skipRefresh) {
            window.__skillsCloudRefresh();
          }
        })
        .catch(function (err) {
          console.warn("[skills-cloud] upsert 请求异常:", err);
        });
    });
  };

  /**
   * 将多条本机技能顺序 upsert 到云端（需已登录）。批量时使用 skipRefresh 避免每条都全表拉取。
   */
  window.__skillsCloudSyncLocalList = function (items) {
    var auth = window.__butterflyAuth;
    var c = getClient();
    if (!c || !auth || !auth.getSession || !Array.isArray(items) || !items.length) {
      return Promise.resolve({ n: 0, skipped: true });
    }
    return auth.getSession().then(function (res) {
      var sess = res && res.data && res.data.session;
      var uid = sess && sess.user && sess.user.id;
      if (!uid) {
        return { n: 0, skipped: true };
      }
      var ix = 0;
      var pushed = 0;
      function step() {
        while (ix < items.length) {
          var it = items[ix];
          ix += 1;
          if (it && it.id != null && String(it.id) !== "") {
            var itemRef = it;
            return Promise.resolve(window.__skillsCloudUpsert(itemRef, { skipRefresh: true })).then(
              function () {
                pushed += 1;
                return step();
              },
              function (e1) {
                console.warn("[skills-cloud] bulk sync item", (itemRef && itemRef.id) || "", e1);
                return step();
              }
            );
          }
        }
        window.__skillsCloudRefresh();
        return Promise.resolve({ n: pushed, skipped: false });
      }
      return step();
    });
  };

  window.__skillsCloudDelete = function (id) {
    var auth = window.__butterflyAuth;
    var c = getClient();
    if (!c || !auth || id == null || id === "") {
      return Promise.resolve();
    }
    return auth.getSession().then(function (res) {
      var sess = res && res.data && res.data.session;
      var uid = sess && sess.user && sess.user.id;
      if (!uid) {
        return null;
      }
      return c
        .from(TABLE)
        .delete()
        .eq("id", String(id))
        .eq("user_id", uid)
        .then(function () {
          window.__skillsCloudRefresh();
        });
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      window.__skillsCloudRefresh();
    });
  } else {
    window.__skillsCloudRefresh();
  }
})();
