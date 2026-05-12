(function () {
  "use strict";

  var STORAGE_KEY = "agent_urls_v1";
  var FAVORITES_KEY = "agent_urls_favorites_v1";
  var SETTINGS_PROFILE_KEY = "butterfly_settings_profile_v1";
  /** 本机 data URL 上限（与详情内案例图一致，约 1.5MB） */
  var MAX_IMAGE_DATA_URL = 2200000;
  var MAX_ADD_SKILL_CASE_IMAGES = 6;
  var ADD_SKILL_IMAGE_FILE_MAX = 600 * 1024;
  /** 「添加知识」无用户填写 URL 时写入占位链接，满足数据模型 */
  var ADD_SKILL_KNOWLEDGE_URL_PLACEHOLDER = "https://invalid.invalid/knowledge";
  var EMPTY_NO_DATA_STORE =
    "技能商店暂无条目。在「我的技能」添加链接；若已登录，将自动同步到云端供他人浏览。";
  var EMPTY_NO_DATA_MINE = "还没有记录。点标题旁的「添加技能」填写名称与网址后保存。";
  var EMPTY_NO_FAV = "暂无收藏。请在技能商店打开技能详情，点底部「收藏链接」加入。";
  var EMPTY_FILTERED = "没有与当前条件匹配的项。可清空搜索框，或改关键词后重试。";

  var listFilterQ = "";
  var listSortV = "new";
  /** 「我的技能」左上角：网址 / 知识 切换 */
  var mineListKindTab = "url";
  /** 「技能商店」左上角：网址 / 知识 切换 */
  var storeListKindTab = "url";
  /** add-skill.html：?edit= 时为编辑已有技能；案例图在页内用 data URL 数组维护 */
  var addSkillEditItemId = null;
  var addSkillManagedCaseImages = [];
  /** 添加/编辑页：历史自由填写的分类文案（与下拉 _legacy_ 选项配合） */
  var addSkillCategoryLegacy = "";
  /** 选「电商」时右侧子类："" 表示未选子类（存「电商」），否则为 SKILL_CAT_EC_SUBS 之一 */
  var addSkillEcSub = "";
  var addSkillCategorySelectsWired = false;
  var SKILL_CAT_TOP_EC = "电商";
  var SKILL_CAT_TOP_OFFICE = "办公提效";
  var SKILL_CAT_TOP_GENERAL = "通用";
  var SKILL_CAT_EC_SUBS = ["运营", "供应链", "客服", "物流", "耗材", "仓库", "IT", "其他"];
  var SKILL_CAT_LEGACY_TOKEN = "_legacy_";
  /** 技能商店列表分组顺序（顶级分类 + 兜底） */
  var STORE_CAT_GROUP_ORDER = [
    SKILL_CAT_TOP_EC,
    SKILL_CAT_TOP_OFFICE,
    SKILL_CAT_TOP_GENERAL,
    "__uncat__",
    "__legacy__"
  ];

  function composeAddSkillCategory(top, sub) {
    var t = top != null ? String(top).trim() : "";
    if (!t) {
      return "";
    }
    if (t === SKILL_CAT_TOP_EC) {
      var s = sub != null ? String(sub).trim() : "";
      return s ? SKILL_CAT_TOP_EC + " / " + s : SKILL_CAT_TOP_EC;
    }
    return t;
  }

  function parseAddSkillCategory(str) {
    var raw = str != null ? String(str).trim() : "";
    if (!raw) {
      return { top: "", sub: "", legacy: "" };
    }
    if (raw === SKILL_CAT_TOP_OFFICE || raw === SKILL_CAT_TOP_GENERAL) {
      return { top: raw, sub: "", legacy: "" };
    }
    if (raw === SKILL_CAT_TOP_EC) {
      return { top: SKILL_CAT_TOP_EC, sub: "", legacy: "" };
    }
    var seps = [" / ", " · ", "／", "/"];
    var si;
    for (si = 0; si < seps.length; si += 1) {
      var sep = seps[si];
      var idx = raw.indexOf(sep);
      if (idx < 0) {
        continue;
      }
      var left = raw.slice(0, idx).trim();
      var right = raw.slice(idx + sep.length).trim();
      if (left === SKILL_CAT_TOP_EC && right) {
        var sj;
        for (sj = 0; sj < SKILL_CAT_EC_SUBS.length; sj += 1) {
          if (SKILL_CAT_EC_SUBS[sj] === right) {
            return { top: SKILL_CAT_TOP_EC, sub: right, legacy: "" };
          }
        }
      }
      break;
    }
    return { top: "", sub: "", legacy: raw };
  }

  function removeAddSkillCategoryLegacyOption() {
    var elTop = document.getElementById("add-skill-category-top");
    if (!elTop) {
      return;
    }
    var existing = elTop.querySelector("option[data-skill-cat-legacy]");
    if (existing) {
      existing.remove();
    }
  }

  function ensureAddSkillCategoryLegacyOption(legacyText) {
    var elTop = document.getElementById("add-skill-category-top");
    if (!elTop || !legacyText) {
      return;
    }
    removeAddSkillCategoryLegacyOption();
    var opt = document.createElement("option");
    opt.value = SKILL_CAT_LEGACY_TOKEN;
    opt.setAttribute("data-skill-cat-legacy", "1");
    var lab = String(legacyText);
    if (lab.length > 36) {
      lab = lab.slice(0, 36) + "…";
    }
    opt.textContent = "沿用原填写：" + lab;
    if (elTop.children.length > 1) {
      elTop.insertBefore(opt, elTop.children[1]);
    } else {
      elTop.appendChild(opt);
    }
  }

  function updateEcSubButtonsSelected() {
    var subRoot = document.getElementById("add-skill-category-ec-submenu");
    if (!subRoot) {
      return;
    }
    var btns = subRoot.querySelectorAll(".add-skill-ec-sub");
    var i;
    for (i = 0; i < btns.length; i += 1) {
      var b = btns[i];
      var ds = b.getAttribute("data-ec-sub");
      var subKey = ds != null ? String(ds) : "";
      var on = subKey === String(addSkillEcSub);
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function closeCategoryPicker() {
    var picker = document.getElementById("add-skill-cat-picker");
    var dd = document.getElementById("add-skill-category-dropdown");
    var tr = document.getElementById("add-skill-category-trigger");
    if (dd) {
      dd.setAttribute("hidden", "");
    }
    if (tr) {
      tr.setAttribute("aria-expanded", "false");
    }
    if (picker) {
      picker.classList.remove("add-skill-cat-picker--menu-open");
    }
    updateCategoryPickerEcSubVisibility();
  }

  function openCategoryPicker() {
    var picker = document.getElementById("add-skill-cat-picker");
    var dd = document.getElementById("add-skill-category-dropdown");
    var tr = document.getElementById("add-skill-category-trigger");
    if (dd) {
      dd.removeAttribute("hidden");
    }
    if (tr) {
      tr.setAttribute("aria-expanded", "true");
    }
    if (picker) {
      picker.classList.add("add-skill-cat-picker--menu-open");
    }
    refreshCategoryPickerMainHighlight();
    updateCategoryPickerEcSubVisibility();
  }

  /** 仅当分类下拉已打开且当前一级为「电商」时显示右侧「电商子类」列 */
  function updateCategoryPickerEcSubVisibility() {
    var sub = document.getElementById("add-skill-category-ec-submenu");
    var dd = document.getElementById("add-skill-category-dropdown");
    var cols = document.querySelector(".add-skill-cat-picker__cols");
    if (!sub || !dd) {
      return;
    }
    var menuOpen = !dd.hasAttribute("hidden");
    var elTop = document.getElementById("add-skill-category-top");
    var v = elTop ? String(elTop.value || "") : "";
    var showEc = menuOpen && v === SKILL_CAT_TOP_EC;
    if (showEc) {
      sub.removeAttribute("hidden");
    } else {
      sub.setAttribute("hidden", "");
    }
    if (cols) {
      cols.classList.toggle("add-skill-cat-picker__cols--solo", !showEc);
    }
  }

  function refreshCategoryTriggerLabel() {
    var elTop = document.getElementById("add-skill-category-top");
    var lab = document.getElementById("add-skill-category-trigger-label");
    if (!lab || !elTop) {
      return;
    }
    var v = String(elTop.value || "");
    if (v === SKILL_CAT_LEGACY_TOKEN) {
      if (addSkillCategoryLegacy) {
        var sx =
          addSkillCategoryLegacy.length > 22
            ? addSkillCategoryLegacy.slice(0, 22) + "…"
            : addSkillCategoryLegacy;
        lab.textContent = "沿用：" + sx;
      } else {
        lab.textContent = "未选分类";
      }
      return;
    }
    if (!v) {
      lab.textContent = "未选分类";
      return;
    }
    if (v === SKILL_CAT_TOP_EC) {
      lab.textContent = composeAddSkillCategory(SKILL_CAT_TOP_EC, addSkillEcSub) || SKILL_CAT_TOP_EC;
      return;
    }
    lab.textContent = v;
  }

  function refreshCategoryPickerMainHighlight() {
    var main = document.getElementById("add-skill-cat-picker-main");
    var elTop = document.getElementById("add-skill-category-top");
    if (!main || !elTop) {
      return;
    }
    var v = String(elTop.value || "");
    var opts = main.querySelectorAll(".add-skill-cat-picker__opt");
    var i;
    for (i = 0; i < opts.length; i += 1) {
      var o = opts[i];
      var dt = o.getAttribute("data-cat-top");
      var topKey = dt != null ? String(dt) : "";
      var on = v !== SKILL_CAT_LEGACY_TOKEN && topKey === v;
      o.classList.toggle("is-active", on);
      o.setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function afterCategorySyncUi() {
    refreshCategoryTriggerLabel();
    refreshCategoryPickerMainHighlight();
    updateEcSubButtonsSelected();
    updateCategoryPickerEcSubVisibility();
  }

  function syncAddSkillCategoryFormToHidden() {
    var elTop = document.getElementById("add-skill-category-top");
    var hid = document.getElementById("add-skill-category");
    var hintLeg = document.getElementById("add-skill-category-legacy-hint");
    if (!elTop || !hid) {
      return;
    }
    function updateLegacyHint(text) {
      if (!hintLeg) {
        return;
      }
      if (text) {
        hintLeg.textContent = text;
        hintLeg.removeAttribute("hidden");
      } else {
        hintLeg.setAttribute("hidden", "");
        hintLeg.textContent = "";
      }
    }
    var selVal = String(elTop.value || "");
    if (selVal === SKILL_CAT_LEGACY_TOKEN) {
      closeCategoryPicker();
      hid.value = addSkillCategoryLegacy || "";
      updateLegacyHint(
        addSkillCategoryLegacy
          ? "当前分类不在新标准内。可直接保存以沿用「" +
              (addSkillCategoryLegacy.length > 40
                ? addSkillCategoryLegacy.slice(0, 40) + "…"
                : addSkillCategoryLegacy) +
              "」；或改选左侧分类为标准项后保存覆盖。"
          : ""
      );
      afterCategorySyncUi();
      return;
    }
    removeAddSkillCategoryLegacyOption();
    addSkillCategoryLegacy = "";
    updateLegacyHint("");
    if (!selVal) {
      closeCategoryPicker();
      addSkillEcSub = "";
      hid.value = "";
      afterCategorySyncUi();
      return;
    }
    if (selVal === SKILL_CAT_TOP_OFFICE || selVal === SKILL_CAT_TOP_GENERAL) {
      closeCategoryPicker();
      addSkillEcSub = "";
      hid.value = selVal;
      afterCategorySyncUi();
      return;
    }
    if (selVal === SKILL_CAT_TOP_EC) {
      hid.value = composeAddSkillCategory(SKILL_CAT_TOP_EC, addSkillEcSub);
      afterCategorySyncUi();
      return;
    }
    closeCategoryPicker();
    addSkillEcSub = "";
    hid.value = selVal;
    afterCategorySyncUi();
  }

  function wireAddSkillCategorySelects() {
    if (!document.body.classList.contains("page-add-skill")) {
      return;
    }
    if (addSkillCategorySelectsWired) {
      return;
    }
    var elTop = document.getElementById("add-skill-category-top");
    var hid = document.getElementById("add-skill-category");
    var picker = document.getElementById("add-skill-cat-picker");
    var trigger = document.getElementById("add-skill-category-trigger");
    var main = document.getElementById("add-skill-cat-picker-main");
    var subRoot = document.getElementById("add-skill-category-ec-submenu");
    if (!elTop || !hid || !picker || !trigger || !main || !subRoot) {
      return;
    }
    addSkillCategorySelectsWired = true;

    function setTopFromPicker(topVal, opts) {
      var o = opts || {};
      var tv = topVal != null ? String(topVal) : "";
      if (tv !== SKILL_CAT_TOP_EC) {
        addSkillEcSub = "";
      }
      elTop.value = tv;
      syncAddSkillCategoryFormToHidden();
      if (o.closeMenu) {
        closeCategoryPicker();
      }
    }

    trigger.addEventListener("click", function (ev) {
      ev.preventDefault();
      var dd = document.getElementById("add-skill-category-dropdown");
      if (dd && dd.hasAttribute("hidden")) {
        openCategoryPicker();
      } else {
        closeCategoryPicker();
      }
    });

    main.addEventListener("click", function (ev) {
      var row = ev.target && ev.target.closest && ev.target.closest(".add-skill-cat-picker__opt");
      if (!row) {
        return;
      }
      var raw = row.getAttribute("data-cat-top");
      var topVal = raw != null ? String(raw) : "";
      if (topVal === SKILL_CAT_TOP_EC) {
        setTopFromPicker(SKILL_CAT_TOP_EC, { closeMenu: false });
        return;
      }
      setTopFromPicker(topVal, { closeMenu: true });
    });

    subRoot.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest(".add-skill-ec-sub");
      if (!t) {
        return;
      }
      elTop.value = SKILL_CAT_TOP_EC;
      var ds = t.getAttribute("data-ec-sub");
      addSkillEcSub = ds != null ? String(ds) : "";
      syncAddSkillCategoryFormToHidden();
      closeCategoryPicker();
    });

    document.addEventListener(
      "mousedown",
      function (ev) {
        if (!picker.classList.contains("add-skill-cat-picker--menu-open")) {
          return;
        }
        var n = ev.target;
        if (n && picker.contains(n)) {
          return;
        }
        closeCategoryPicker();
      },
      true
    );

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") {
        return;
      }
      if (!picker.classList.contains("add-skill-cat-picker--menu-open")) {
        return;
      }
      closeCategoryPicker();
    });

    syncAddSkillCategoryFormToHidden();
  }

  var form = document.getElementById("add-form");
  var nameInput = document.getElementById("name");
  var urlInput = document.getElementById("url");
  var formError = document.getElementById("form-error");
  var storeSkillGrouped = document.getElementById("store-skill-grouped");
  var urlListMine = document.getElementById("url-list-mine");
  var urlListFav = document.getElementById("url-list-fav");
  var emptyHint = document.getElementById("empty-hint");
  var emptyHintMine = document.getElementById("empty-hint-mine");
  var emptyHintFav = document.getElementById("empty-hint-fav");
  var listFilter = document.getElementById("list-filter");
  var listSort = document.getElementById("list-sort");
  var btnExport = document.getElementById("btn-export");
  var importFile = document.getElementById("import-file");
  var importError = document.getElementById("import-error");
  var importOk = document.getElementById("import-ok");

  /** 「我的技能」卡片上的编辑 / 删除（事件委托，仅绑定一次） */
  function wireMineCardActions() {
    if (!urlListMine || urlListMine.dataset.skillMineActionsWired === "1") {
      return;
    }
    urlListMine.dataset.skillMineActionsWired = "1";
    urlListMine.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("[data-skill-mine]");
      if (!t) {
        return;
      }
      var li = t.closest(".skill-card");
      var id = li && li.getAttribute("data-id");
      if (!id) {
        return;
      }
      var action = t.getAttribute("data-skill-mine");
      if (action === "edit") {
        e.preventDefault();
        e.stopPropagation();
        var itEdit = getItemById(id);
        if (!itEdit) {
          return;
        }
        var hash = isSkillKnowledgeItem(itEdit) ? "#knowledge" : "#url";
        window.location.href =
          "add-skill.html?edit=" + encodeURIComponent(String(id)) + hash;
        return;
      }
      if (action === "delete") {
        e.preventDefault();
        e.stopPropagation();
        if (
          !window.confirm(
            "将从本机永久删除该链接。若未事先导出 JSON，将无法恢复。是否删除？"
          )
        ) {
          return;
        }
        deleteItem(id);
        render();
      }
    });
  }
  wireMineCardActions();
  wireMineKindTabs();
  wireStoreKindTabs();

  function syncListControls() {
    if (listFilter) listFilter.value = listFilterQ;
    if (listSort) listSort.value = listSortV;
  }

  (function initListStateFromDom() {
    if (listFilter && listFilter.value) {
      listFilterQ = listFilter.value;
    }
    if (listSort) {
      listSortV = listSort.value || "new";
    }
    syncListControls();
  }());

  function getItems() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function setItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function getFavoriteIds() {
    try {
      var raw = localStorage.getItem(FAVORITES_KEY);
      if (!raw) {
        return [];
      }
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) {
        return [];
      }
      var out = [];
      for (var fi = 0; fi < arr.length; fi += 1) {
        if (arr[fi] != null && String(arr[fi]).length) {
          out.push(String(arr[fi]));
        }
      }
      return out;
    } catch (eFav) {
      return [];
    }
  }

  function setFavoriteIds(ids) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  }

  function addFavoriteId(id) {
    if (id == null) {
      return;
    }
    var sid = String(id);
    var before = getFavoriteIds();
    if (before.indexOf(sid) >= 0) {
      var idsReorder = before.filter(function (x) {
        return x !== sid;
      });
      idsReorder.unshift(sid);
      setFavoriteIds(idsReorder);
      return;
    }
    var ids = before.filter(function (x) {
      return x !== sid;
    });
    ids.unshift(sid);
    setFavoriteIds(ids);
    updateItemById(sid, function (row) {
      var c = Math.floor(Number(row.favoriteCount));
      if (!isFinite(c) || c < 0) {
        c = 0;
      }
      row.favoriteCount = c + 1;
    });
  }

  function removeFavoriteId(id) {
    if (id == null) {
      return;
    }
    var sid = String(id);
    var before = getFavoriteIds();
    if (before.indexOf(sid) < 0) {
      return;
    }
    setFavoriteIds(
      before.filter(function (x) {
        return x !== sid;
      })
    );
    updateItemById(sid, function (row) {
      var c = Math.floor(Number(row.favoriteCount));
      if (!isFinite(c) || c < 0) {
        c = 0;
      }
      row.favoriteCount = Math.max(0, c - 1);
      if (row.favoriteCount === 0) {
        delete row.favoriteCount;
      }
    });
  }

  /** 详情「收藏」格展示：本机累计收藏次数（仅存本机，多设备不同步） */
  function getSkillFavoriteCountForDisplay(it) {
    if (!it) {
      return 0;
    }
    var n = Math.floor(Number(it.favoriteCount));
    if (isFinite(n) && n > 0) {
      return n;
    }
    return 0;
  }

  /** 导入或删除后，去掉收藏里已不存在的技能 id（本机 + 云端缓存） */
  function pruneFavoriteOrphans() {
    var sid = {};
    var items = getItems();
    for (var i = 0; i < items.length; i += 1) {
      sid[String(items[i].id)] = true;
    }
    var cloud = window.__skillsCloudCache || [];
    for (var c = 0; c < cloud.length; c += 1) {
      sid[String(cloud[c].id)] = true;
    }
    setFavoriteIds(
      getFavoriteIds().filter(function (id) {
        return !!sid[id];
      })
    );
  }

  function isFavoriteId(id) {
    return getFavoriteIds().indexOf(String(id)) >= 0;
  }

  function getFavoriteItems() {
    var ids = getFavoriteIds();
    var byId = {};
    var items = getItems();
    for (var i = 0; i < items.length; i += 1) {
      byId[String(items[i].id)] = items[i];
    }
    var cloud = window.__skillsCloudCache || [];
    for (var c = 0; c < cloud.length; c += 1) {
      var cid = String(cloud[c].id);
      if (!byId[cid]) {
        byId[cid] = cloud[c];
      }
    }
    var out = [];
    for (var j = 0; j < ids.length; j += 1) {
      var it = byId[ids[j]];
      if (it) {
        out.push(it);
      }
    }
    return out;
  }

  function getDisplayFavoriteItems() {
    var fav = getFavoriteItems();
    var q = filterQuery();
    var filtered = [];
    for (var k = 0; k < fav.length; k += 1) {
      if (matchesFilter(fav[k], q)) {
        filtered.push(fav[k]);
      }
    }
    if (sortMode() === "name_asc") {
      return filtered.slice().sort(function (a, b) {
        var A = (normalizeName(a.name) || a.url || "");
        var B = (normalizeName(b.name) || b.url || "");
        return A.localeCompare(B, "zh-CN", { numeric: true });
      });
    }
    return filtered;
  }

  function setFavEmptyState(totalFavCount, shownCount) {
    if (!emptyHintFav) {
      return;
    }
    if (totalFavCount === 0) {
      emptyHintFav.textContent = EMPTY_NO_FAV;
      emptyHintFav.hidden = false;
      return;
    }
    if (shownCount === 0) {
      emptyHintFav.textContent = EMPTY_FILTERED;
      emptyHintFav.hidden = false;
    } else {
      emptyHintFav.hidden = true;
    }
  }

  /** 与系统设置「个人信息」中的昵称同源，供技能详情「开发者」等展示 */
  function getStoredProfileNickname() {
    try {
      var raw = localStorage.getItem(SETTINGS_PROFILE_KEY);
      if (!raw) {
        return "";
      }
      var o = JSON.parse(raw);
      if (o && o.nickname && String(o.nickname).trim()) {
        return String(o.nickname).trim();
      }
    } catch (eNick) {}
    return "";
  }

  function normalizeName(s) {
    if (s == null) return "";
    return String(s).trim();
  }

  function isValidUrlString(s) {
    try {
      var u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  function getAddSkillEditIdFromUrl() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var id = q.get("edit");
      return id && String(id).trim() ? String(id).trim() : null;
    } catch (eUrl) {
      return null;
    }
  }

  function normalizeFeaturedCaseImagesArr(arr) {
    if (!Array.isArray(arr)) {
      return [];
    }
    var out = [];
    for (var k = 0; k < arr.length && out.length < MAX_ADD_SKILL_CASE_IMAGES; k += 1) {
      var s = arr[k];
      if (typeof s !== "string" || s.indexOf("data:image/") !== 0) {
        continue;
      }
      if (s.length > MAX_IMAGE_DATA_URL) {
        continue;
      }
      out.push(s);
    }
    return out;
  }

  function addItem(name, url, opt) {
    opt = opt || {};
    var items = getItems();
    var entry = {
      id: self.crypto && crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      name: name,
      url: url,
      createdAt: new Date().toISOString()
    };
    var di = opt.detailIntro != null ? String(opt.detailIntro).trim() : "";
    if (di) {
      entry.detailIntro = di;
    }
    var sc = opt.skillCategory != null ? String(opt.skillCategory).trim() : "";
    if (sc) {
      entry.skillCategory = sc;
    }
    if (opt.openSourceMode === "yes" || opt.openSourceMode === "no") {
      entry.openSourceMode = opt.openSourceMode;
    }
    if (
      opt.cardImageDataUrl &&
      typeof opt.cardImageDataUrl === "string" &&
      opt.cardImageDataUrl.indexOf("data:image/") === 0 &&
      opt.cardImageDataUrl.length <= MAX_IMAGE_DATA_URL
    ) {
      entry.cardImageDataUrl = opt.cardImageDataUrl;
    }
    var casesNorm = normalizeFeaturedCaseImagesArr(opt.featuredCasesImages);
    if (casesNorm.length) {
      entry.featuredCasesImages = casesNorm;
    }
    var fcOpt = Math.floor(Number(opt.favoriteCount));
    if (isFinite(fcOpt) && fcOpt > 0) {
      entry.favoriteCount = fcOpt;
    }
    if (opt.skillKind === "knowledge" || opt.skillKind === "url") {
      entry.skillKind = opt.skillKind;
    } else if (String(url || "") === ADD_SKILL_KNOWLEDGE_URL_PLACEHOLDER) {
      entry.skillKind = "knowledge";
    } else {
      entry.skillKind = "url";
    }
    items.unshift(entry);
    setItems(items);
    if (typeof window.__skillsCloudUpsert === "function") {
      window.__skillsCloudUpsert(entry);
    }
    return entry;
  }

  function deleteItem(id) {
    removeFavoriteId(id);
    if (typeof window.__skillsCloudDelete === "function") {
      window.__skillsCloudDelete(id);
    }
    setItems(getItems().filter(function (x) { return x.id !== id; }));
  }

  function updateItemById(id, fn) {
    var items = getItems();
    var n = -1;
    for (var i = 0; i < items.length; i += 1) {
      if (String(items[i].id) === String(id)) {
        n = i;
        break;
      }
    }
    if (n < 0) {
      return null;
    }
    var next = Object.assign({}, items[n]);
    fn(next);
    items = items.slice();
    items[n] = next;
    setItems(items);
    if (typeof window.__skillsCloudUpsert === "function") {
      window.__skillsCloudUpsert(next);
    }
    return next;
  }

  function showFormError(msg) {
    if (!formError) return;
    formError.textContent = msg;
    formError.hidden = !msg;
  }

  function showImportError(msg) {
    if (!importError) {
      return;
    }
    importError.textContent = msg;
    importError.hidden = !msg;
    if (msg && importOk) importOk.hidden = true;
  }

  function showImportOk(msg) {
    if (!importOk) {
      return;
    }
    importOk.textContent = msg;
    importOk.hidden = !msg;
    if (msg && importError) importError.hidden = true;
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function hueFromId(id) {
    if (!id) return 0;
    var h = 0;
    for (var k = 0; k < id.length; k += 1) h = (h * 33 + id.charCodeAt(k)) % 360;
    return h;
  }

  function firstAvatarChar(titleText) {
    var t = (titleText == null) ? "" : String(titleText).trim();
    if (t.length === 0) return "·";
    return t.charAt(0);
  }

  function filterQuery() {
    return String(listFilterQ || "").trim().toLowerCase();
  }

  function sortMode() {
    return listSortV || "new";
  }

  function matchesFilter(it, q) {
    if (!q) return true;
    var name = normalizeName(it.name).toLowerCase();
    var u = (it.url || "").toLowerCase();
    var intro = it.detailIntro != null ? String(it.detailIntro).toLowerCase() : "";
    var catQ = it.skillCategory != null ? String(it.skillCategory).toLowerCase() : "";
    return (
      (name && name.indexOf(q) !== -1) ||
      (u && u.indexOf(q) !== -1) ||
      intro.indexOf(q) !== -1 ||
      (catQ && catQ.indexOf(q) !== -1)
    );
  }

  function getDisplayItems() {
    var all = getItems();
    var q = filterQuery();
    var filtered = [];
    for (var i = 0; i < all.length; i += 1) {
      if (matchesFilter(all[i], q)) filtered.push(all[i]);
    }
    if (sortMode() === "name_asc") {
      filtered = filtered.slice().sort(function (a, b) {
        var A = (normalizeName(a.name) || a.url || "");
        var B = (normalizeName(b.name) || b.url || "");
        return A.localeCompare(B, "zh-CN", { numeric: true });
      });
    }
    return filtered;
  }

  /**
   * 本机筛选结果 + 云端子集（cloudPasses 为 null 表示全部云端行；否则仅保留 cloudPasses(it) 为 true 的）
   * 去重 id（本机优先），再按当前排序模式排序。
   */
  function mergeListWithCloud(localFiltered, cloudPasses) {
    var cloud = window.__skillsCloudCache || [];
    var q = filterQuery();
    var cloudF = [];
    var i;
    for (i = 0; i < cloud.length; i += 1) {
      if (cloudPasses != null && typeof cloudPasses === "function" && !cloudPasses(cloud[i])) {
        continue;
      }
      if (matchesFilter(cloud[i], q)) {
        cloudF.push(cloud[i]);
      }
    }
    var seen = {};
    var out = [];
    var j;
    for (j = 0; j < localFiltered.length; j += 1) {
      seen[String(localFiltered[j].id)] = true;
      out.push(localFiltered[j]);
    }
    for (j = 0; j < cloudF.length; j += 1) {
      var id = String(cloudF[j].id);
      if (!seen[id]) {
        seen[id] = true;
        out.push(cloudF[j]);
      }
    }
    if (sortMode() === "name_asc") {
      out = out.slice().sort(function (a, b) {
        var A = (normalizeName(a.name) || a.url || "");
        var B = (normalizeName(b.name) || b.url || "");
        return A.localeCompare(B, "zh-CN", { numeric: true });
      });
    } else {
      out = out.slice().sort(function (a, b) {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
    }
    return out;
  }

  /** 技能商店：本机 + 全部云端 */
  function mergeStoreWithCloud(localFiltered) {
    return mergeListWithCloud(localFiltered, null);
  }

  /** 我的技能：本机 + 当前登录用户在云端且 id 未在本机出现的行（本机同 id 优先） */
  function mergeMineWithCloud(localFiltered) {
    var uid = window.__skillsCloudSessionUserId;
    if (!uid) {
      return mergeListWithCloud(localFiltered, function () {
        return false;
      });
    }
    return mergeListWithCloud(localFiltered, function (it) {
      return String(it.cloudUserId || "") === String(uid);
    });
  }

  function isSkillKnowledgeItem(it) {
    if (!it) {
      return false;
    }
    var k = String(it.skillKind || "").toLowerCase();
    if (k === "knowledge") {
      return true;
    }
    if (k === "url") {
      return false;
    }
    return String(it.url || "") === ADD_SKILL_KNOWLEDGE_URL_PLACEHOLDER;
  }

  /** 编辑页是否禁止切换「网址 / 知识」（有显式 skillKind，或为占位链接的知识项） */
  function shouldLockAddSkillEditTabs(it) {
    if (!it) {
      return false;
    }
    var k = String(it.skillKind || "").toLowerCase();
    if (k === "knowledge" || k === "url") {
      return true;
    }
    return String(it.url || "") === ADD_SKILL_KNOWLEDGE_URL_PLACEHOLDER;
  }

  function filterItemsByKindTab(items, tab) {
    if (tab === "knowledge") {
      return items.filter(function (it) {
        return isSkillKnowledgeItem(it);
      });
    }
    return items.filter(function (it) {
      return !isSkillKnowledgeItem(it);
    });
  }

  function filterMineItemsForKindTab(items) {
    return filterItemsByKindTab(items, mineListKindTab);
  }

  function filterStoreItemsForKindTab(items) {
    return filterItemsByKindTab(items, storeListKindTab);
  }

  function syncMineKindTabUi() {
    var tUrl = document.getElementById("mine-tab-url");
    var tKn = document.getElementById("mine-tab-knowledge");
    if (!tUrl || !tKn) {
      return;
    }
    var isK = mineListKindTab === "knowledge";
    tUrl.setAttribute("aria-selected", isK ? "false" : "true");
    tKn.setAttribute("aria-selected", isK ? "true" : "false");
    tUrl.classList.toggle("mine-kind-tabs__tab--active", !isK);
    tKn.classList.toggle("mine-kind-tabs__tab--active", isK);
  }

  function wireMineKindTabs() {
    var root = document.getElementById("app-mainbar");
    if (!root || root.dataset.mineKindTabsWired === "1") {
      return;
    }
    root.dataset.mineKindTabsWired = "1";
    root.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("[data-mine-kind]");
      if (!t) {
        return;
      }
      var k = t.getAttribute("data-mine-kind");
      if (k !== "url" && k !== "knowledge") {
        return;
      }
      mineListKindTab = k;
      syncMineKindTabUi();
      render();
    });
    syncMineKindTabUi();
  }

  function syncStoreKindTabUi() {
    var tUrl = document.getElementById("store-tab-url");
    var tKn = document.getElementById("store-tab-knowledge");
    if (!tUrl || !tKn) {
      return;
    }
    var isK = storeListKindTab === "knowledge";
    tUrl.setAttribute("aria-selected", isK ? "false" : "true");
    tKn.setAttribute("aria-selected", isK ? "true" : "false");
    tUrl.classList.toggle("store-kind-tabs__tab--active", !isK);
    tKn.classList.toggle("store-kind-tabs__tab--active", isK);
  }

  function wireStoreKindTabs() {
    var root = document.getElementById("app-mainbar");
    if (!root || root.dataset.storeKindTabsWired === "1") {
      return;
    }
    root.dataset.storeKindTabsWired = "1";
    root.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("[data-store-kind]");
      if (!t) {
        return;
      }
      var k = t.getAttribute("data-store-kind");
      if (k !== "url" && k !== "knowledge") {
        return;
      }
      storeListKindTab = k;
      syncStoreKindTabUi();
      render();
    });
    syncStoreKindTabUi();
  }

  function setEmptyState(totalCount, mineShownCount, storeShownCount, cloudTotalCount, mineHintTotal) {
    var cloudN = typeof cloudTotalCount === "number" ? cloudTotalCount : 0;
    var mineHint = typeof mineHintTotal === "number" ? mineHintTotal : totalCount;
    var storeShown = typeof storeShownCount === "number" ? storeShownCount : mineShownCount;
    function applyStore(hint) {
      if (!hint) {
        return;
      }
      if (totalCount + cloudN === 0) {
        hint.textContent = EMPTY_NO_DATA_STORE;
        hint.hidden = false;
        return;
      }
      if (storeShown === 0) {
        if (filterQuery()) {
          hint.textContent = EMPTY_FILTERED;
        } else if (storeListKindTab === "knowledge") {
          hint.textContent = "暂无知识类技能展示。";
        } else {
          hint.textContent = "暂无网址类技能展示。";
        }
        hint.hidden = false;
      } else {
        hint.hidden = true;
      }
    }
    function applyMine(hint) {
      if (!hint) {
        return;
      }
      if (mineShownCount > 0) {
        hint.hidden = true;
        return;
      }
      if (mineHint === 0) {
        hint.textContent = EMPTY_NO_DATA_MINE;
        hint.hidden = false;
        return;
      }
      if (filterQuery()) {
        hint.textContent = EMPTY_FILTERED;
      } else if (mineListKindTab === "knowledge") {
        hint.textContent =
          "暂无知识类技能。在「添加技能」中选「添加知识」保存后会显示在这里。";
      } else {
        hint.textContent = "暂无网址类技能。";
      }
      hint.hidden = false;
    }
    applyStore(emptyHint);
    applyMine(emptyHintMine);
  }

  /** 卡片第三行：详情介绍文案（去空白），无则不在 DOM 中渲染该行 */
  function skillCardDetailIntroText(it) {
    if (!it || it.detailIntro == null) {
      return "";
    }
    return String(it.detailIntro).replace(/\s+/g, " ").trim();
  }

  /** 卡片右下角 @ 行：云端条目用发布时昵称；本机条目用当前设置昵称；否则用链接主机名 */
  function skillCardByline(it) {
    if (it && it.authorDisplay != null && String(it.authorDisplay).trim()) {
      return "@" + String(it.authorDisplay).trim();
    }
    var nick = getStoredProfileNickname();
    if (nick) {
      return "@" + nick;
    }
    try {
      var u = new URL(it && it.url ? it.url : "");
      var h = (u.hostname || "").replace(/^www\./, "");
      return h ? "@" + h : "@链接";
    } catch (e) {
      return "@链接";
    }
  }

  function getItemById(id) {
    var items = getItems();
    for (var i = 0; i < items.length; i += 1) {
      if (String(items[i].id) === String(id)) {
        return items[i];
      }
    }
    var cloud = window.__skillsCloudCache || [];
    for (var j = 0; j < cloud.length; j += 1) {
      if (String(cloud[j].id) === String(id)) {
        return cloud[j];
      }
    }
    return null;
  }

  function buildSkillCardLi(it, listKind) {
    var isMine = listKind === "mine";
    var isFav = listKind === "fav";
    var li = document.createElement("li");
    li.className = "skill-card" + (isFav ? " skill-card--fav" : "");
    li.setAttribute("data-id", it.id);
    li.setAttribute("role", "listitem");
    var titleText = (it.name && it.name.length) ? it.name : (it.url || "未命名");
    var h = hueFromId(it.id);
    var thumbBg = "linear-gradient(150deg, hsl(" + h + ", 32%, 92%), hsl(" + (h + 20) + ", 28%, 86%))";

    var inner = document.createElement("div");
    inner.className = "skill-card__inner";
    var surface = document.createElement("button");
    surface.type = "button";
    surface.className = "skill-card__surface";
    var tHint = [formatDate(it.createdAt) || "", it.url || ""].filter(Boolean).join(" · ");
    if (tHint) surface.setAttribute("title", tHint);
    surface.setAttribute("aria-label", "查看「" + titleText + "」详情");
    var row = document.createElement("div");
    row.className = "skill-card__row";
    var thumb = document.createElement("div");
    thumb.setAttribute("aria-hidden", "true");
    var canImg =
      it &&
      it.cardImageDataUrl &&
      typeof it.cardImageDataUrl === "string" &&
      it.cardImageDataUrl.indexOf("data:image/") === 0 &&
      it.cardImageDataUrl.length <= MAX_IMAGE_DATA_URL;
    if (canImg) {
      thumb.className = "skill-card__thumb skill-card__thumb--has-img";
      var im0 = document.createElement("img");
      im0.className = "skill-card__thumb-img";
      im0.src = it.cardImageDataUrl;
      im0.alt = "";
      im0.loading = "lazy";
      thumb.appendChild(im0);
    } else {
      thumb.className = "skill-card__thumb";
      thumb.style.background = thumbBg;
      var letter = document.createElement("span");
      letter.className = "skill-card__thumb-letter";
      letter.textContent = firstAvatarChar(titleText);
      thumb.appendChild(letter);
    }
    var textCol = document.createElement("div");
    textCol.className = "skill-card__text";
    var h3 = document.createElement("h3");
    h3.className = "skill-card__title";
    h3.textContent = titleText;
    var intro = skillCardDetailIntroText(it);
    var detailLine = document.createElement("p");
    detailLine.className = "skill-card__lede";
    detailLine.textContent = intro.length > 0 ? intro : "—";
    textCol.appendChild(h3);
    textCol.appendChild(detailLine);
    row.appendChild(thumb);
    row.appendChild(textCol);
    var bar = document.createElement("div");
    bar.className = "skill-card__bar";
    var freeEl = document.createElement("span");
    freeEl.className = "skill-card__free";
    freeEl.textContent = "免费";
    var byEl = document.createElement("span");
    byEl.className = "skill-card__byline";
    byEl.textContent = skillCardByline(it);
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "价格与开发者");
    bar.appendChild(freeEl);
    bar.appendChild(byEl);
    surface.appendChild(row);
    surface.appendChild(bar);
    inner.appendChild(surface);
    if (isMine) {
      var act = document.createElement("div");
      act.className = "skill-card__mine-actions";
      act.setAttribute("role", "group");
      act.setAttribute("aria-label", "本技能操作");
      var bEdit = document.createElement("button");
      bEdit.type = "button";
      bEdit.className = "skill-card__mine-btn";
      bEdit.setAttribute("data-skill-mine", "edit");
      bEdit.textContent = "编辑";
      bEdit.setAttribute("aria-label", "编辑「" + titleText + "」");
      var bDel = document.createElement("button");
      bDel.type = "button";
      bDel.className = "skill-card__mine-btn skill-card__mine-btn--del";
      bDel.setAttribute("data-skill-mine", "delete");
      bDel.textContent = "删除";
      bDel.setAttribute("aria-label", "删除「" + titleText + "」");
      act.appendChild(bEdit);
      act.appendChild(bDel);
      inner.appendChild(act);
    }
    li.appendChild(inner);
    return li;
  }

  function fillList(ul, items, listKind) {
    if (!ul) {
      return;
    }
    ul.innerHTML = "";
    for (var i = 0; i < items.length; i += 1) {
      ul.appendChild(buildSkillCardLi(items[i], listKind));
    }
  }

  function getStoreCategoryGroupKey(it) {
    var raw = it && it.skillCategory != null ? String(it.skillCategory) : "";
    var p = parseAddSkillCategory(raw);
    if (p.legacy) {
      return "__legacy__";
    }
    if (
      p.top === SKILL_CAT_TOP_EC ||
      p.top === SKILL_CAT_TOP_OFFICE ||
      p.top === SKILL_CAT_TOP_GENERAL
    ) {
      return p.top;
    }
    return "__uncat__";
  }

  function getStoreCategoryGroupTitle(key) {
    if (key === "__uncat__") {
      return "未分类";
    }
    if (key === "__legacy__") {
      return "其他（旧版分类）";
    }
    return key;
  }

  function sortStoreCategoryKeys(keys) {
    function rank(k) {
      var ix = STORE_CAT_GROUP_ORDER.indexOf(k);
      return ix >= 0 ? ix : 1000;
    }
    return keys.slice().sort(function (a, b) {
      var ra = rank(a);
      var rb = rank(b);
      if (ra !== rb) {
        return ra - rb;
      }
      return String(a).localeCompare(String(b), "zh-CN");
    });
  }

  /** 技能商店：按技能分类分块渲染（每块标题 + url-grid） */
  function fillStoreListGrouped(root, items) {
    if (!root) {
      return;
    }
    root.innerHTML = "";
    if (!items.length) {
      return;
    }
    var buckets = {};
    var i;
    for (i = 0; i < items.length; i += 1) {
      var it = items[i];
      var k = getStoreCategoryGroupKey(it);
      if (!buckets[k]) {
        buckets[k] = [];
      }
      buckets[k].push(it);
    }
    var keyList = sortStoreCategoryKeys(Object.keys(buckets));
    for (i = 0; i < keyList.length; i += 1) {
      var key = keyList[i];
      var arr = buckets[key];
      if (!arr || !arr.length) {
        continue;
      }
      var sec = document.createElement("section");
      sec.className = "store-cat-group";
      sec.setAttribute("aria-label", getStoreCategoryGroupTitle(key));
      var h3 = document.createElement("h3");
      h3.className = "store-cat-group__title";
      h3.textContent = getStoreCategoryGroupTitle(key);
      var ul = document.createElement("ul");
      ul.className = "url-grid";
      ul.setAttribute("role", "list");
      var j;
      for (j = 0; j < arr.length; j += 1) {
        ul.appendChild(buildSkillCardLi(arr[j], "store"));
      }
      sec.appendChild(h3);
      sec.appendChild(ul);
      root.appendChild(sec);
    }
  }

  function render() {
    var all = getItems();
    var localFiltered = getDisplayItems();
    var storeItems = mergeStoreWithCloud(localFiltered);
    var mineItems = mergeMineWithCloud(localFiltered);
    var cloudCache = window.__skillsCloudCache || [];
    var uid = window.__skillsCloudSessionUserId;
    var mineCloudExclusive = 0;
    if (uid && cloudCache.length) {
      var sid = {};
      var mx;
      for (mx = 0; mx < all.length; mx += 1) {
        sid[String(all[mx].id)] = true;
      }
      var cx;
      for (cx = 0; cx < cloudCache.length; cx += 1) {
        var crow = cloudCache[cx];
        if (String(crow.cloudUserId || "") === String(uid) && !sid[String(crow.id)]) {
          mineCloudExclusive += 1;
        }
      }
    }
    var mineHintTotal = all.length + mineCloudExclusive;
    var mineItemsForList = filterMineItemsForKindTab(mineItems);
    var storeItemsForList = filterStoreItemsForKindTab(storeItems);
    setEmptyState(all.length, mineItemsForList.length, storeItemsForList.length, cloudCache.length, mineHintTotal);
    fillStoreListGrouped(storeSkillGrouped, storeItemsForList);
    fillList(urlListMine, mineItemsForList, "mine");
    syncMineKindTabUi();
    syncStoreKindTabUi();
    var favAll = getFavoriteItems();
    var favShown = getDisplayFavoriteItems();
    setFavEmptyState(favAll.length, favShown.length);
    fillList(urlListFav, favShown, "fav");
  }

  function detailGuessCategory(urlStr) {
    try {
      var u = new URL(urlStr);
      var h = (u.hostname + u.pathname).toLowerCase();
      if (/(edu|mooc|course|learn|school|学院)/.test(h)) {
        return "教育";
      }
      if (/(github|gitlab|gitee|git\.)/.test(h)) {
        return "开发";
      }
    } catch (e1) {
    }
    return "通用";
  }

  function detailIsOpenSource(urlStr) {
    try {
      var h = new URL(urlStr).hostname.toLowerCase();
      if (h.indexOf("github.com") >= 0 || h.indexOf("gitee.com") >= 0 || h.indexOf("gitlab") >= 0) {
        return "是";
      }
    } catch (e2) {
    }
    return "否";
  }

  function initSkillDetailModal() {
    var root = document.getElementById("skill-detail");
    if (!root) {
      return;
    }
    var cta = document.getElementById("skill-detail-cta");
    var footerEl = document.getElementById("skill-detail-footer");
    var btnCollect = document.getElementById("skill-detail-collect");
    var btnUnfav = document.getElementById("skill-detail-unfav");
    var descEl = document.getElementById("skill-detail-desc");
    var btnShare = document.getElementById("skill-detail-share");
    var btnExpand = document.getElementById("skill-detail-expand");
    var storeSec = document.getElementById("skill-detail-store-section");
    var mineSec = document.getElementById("skill-detail-mine-section");
    var casesBlock = document.getElementById("skill-detail-cases-block");
    var casesP = document.getElementById("skill-detail-cases");
    var taDetail = document.getElementById("skill-detail-ta-detail");
    var btnSave = document.getElementById("skill-detail-save");
    var btnDelete = document.getElementById("skill-detail-delete");
    var fileCases = document.getElementById("skill-detail-cases-file");
    var casesThumbs = document.getElementById("skill-detail-cases-thumbs");
    var casesImgsRead = document.getElementById("skill-detail-cases-imgs-read");
    var caseLightbox = document.getElementById("case-image-lightbox");
    var caseLightboxImg = document.getElementById("case-image-lightbox-img");
    var caseLightboxClose = document.getElementById("case-image-lightbox-close");
    var caseLightboxBackdrop = document.getElementById("case-image-lightbox-backdrop");
    var lastActive = null;
    var lastOpenedId = null;
    var lastCardSurface = null;
    var panelEl = root && root.querySelector && root.querySelector(".skill-detail__panel");

    function useSkillViewTransition() {
      return (
        typeof document !== "undefined" &&
        document.startViewTransition &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    }
    var modalCaseImages = [];
    var modalCardImage = null;
    /** 当前详情是否从「我的技能」打开（商店 / 收藏 中为 false，禁止改卡片图） */
    var detailModalFromMine = false;
    /** 当前详情是否从「我的收藏」打开 */
    var detailModalFromFav = false;
    var logoEl = document.getElementById("skill-detail-card-logo");
    var logoFallbackEl = document.getElementById("skill-detail-card-logo-fallback");
    var logoLetterEl = document.getElementById("skill-detail-card-logo-letter");
    var fileCard = document.getElementById("skill-detail-card-file");
    var btnCardEdit = document.getElementById("skill-detail-card-edit");
    var MAX_CASE_IMAGES = MAX_ADD_SKILL_CASE_IMAGES;
    var MAX_DATA_URL_LEN = 2200000;

    /** 与 buildSkillCardLi 中 titleText 一致，用于首字默认图 */
    function skillDetailTitleText(it) {
      if (!it) {
        return "未命名";
      }
      if (it.name && it.name.length) {
        return it.name;
      }
      return it.url || "未命名";
    }

    function setDetailSkillLogo(it, dataUrl) {
      var d = dataUrl;
      var hasImg =
        d &&
        typeof d === "string" &&
        d.indexOf("data:image/") === 0 &&
        d.length <= MAX_DATA_URL_LEN;
      var titleText = skillDetailTitleText(it);
      if (hasImg) {
        if (logoEl) {
          logoEl.removeAttribute("hidden");
          logoEl.src = d;
          logoEl.classList.add("skill-detail__logo--custom");
        }
        if (logoFallbackEl) {
          logoFallbackEl.setAttribute("hidden", "");
        }
      } else {
        if (logoEl) {
          logoEl.setAttribute("hidden", "");
          logoEl.removeAttribute("src");
          logoEl.classList.remove("skill-detail__logo--custom");
        }
        if (logoFallbackEl) {
          logoFallbackEl.removeAttribute("hidden");
          var hi = hueFromId(it && it.id);
          logoFallbackEl.style.background =
            "linear-gradient(150deg, hsl(" + hi + ", 32%, 92%), hsl(" + (hi + 20) + ", 28%, 86%))";
        }
        if (logoLetterEl) {
          logoLetterEl.textContent = firstAvatarChar(titleText);
        }
      }
    }

    function normalizeDataUrlList(arr) {
      if (!Array.isArray(arr)) {
        return [];
      }
      var out = [];
      for (var k = 0; k < arr.length && out.length < MAX_CASE_IMAGES; k += 1) {
        var s = arr[k];
        if (typeof s !== "string" || s.indexOf("data:image/") !== 0) {
          continue;
        }
        if (s.length > MAX_DATA_URL_LEN) {
          continue;
        }
        out.push(s);
      }
      return out;
    }

    function renderCaseThumbsMine() {
      if (!casesThumbs) {
        return;
      }
      casesThumbs.innerHTML = "";
      for (var i = 0; i < modalCaseImages.length; i += 1) {
        var u = modalCaseImages[i];
        var wrap = document.createElement("div");
        wrap.className = "skill-detail__case-thumb";
        wrap.setAttribute("title", "点击查看大图");
        var img = document.createElement("img");
        img.src = u;
        img.alt = "案例图 " + (i + 1);
        img.loading = "lazy";
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "skill-detail__case-thumb-rm";
        rm.setAttribute("data-case-img-remove", String(i));
        rm.setAttribute("aria-label", "删除第 " + (i + 1) + " 张");
        rm.textContent = "×";
        wrap.appendChild(img);
        wrap.appendChild(rm);
        casesThumbs.appendChild(wrap);
      }
    }

    function openCaseImageLightbox(src, alt) {
      if (!caseLightbox || !caseLightboxImg) {
        return;
      }
      if (!src) {
        return;
      }
      caseLightboxImg.src = src;
      caseLightboxImg.alt = alt != null && String(alt) ? String(alt) : "案例配图";
      caseLightbox.removeAttribute("hidden");
      caseLightbox.setAttribute("aria-hidden", "false");
      if (caseLightboxClose) {
        caseLightboxClose.focus();
      }
    }

    function closeCaseImageLightbox() {
      if (!caseLightbox || !caseLightboxImg) {
        return;
      }
      caseLightbox.setAttribute("hidden", "");
      caseLightbox.setAttribute("aria-hidden", "true");
      caseLightboxImg.removeAttribute("src");
      caseLightboxImg.alt = "";
    }

    function isCaseImageLightboxOpen() {
      return caseLightbox && !caseLightbox.hasAttribute("hidden");
    }

    function renderCaseThumbsRead(urls) {
      if (!casesImgsRead) {
        return;
      }
      var list = normalizeDataUrlList(urls || []);
      if (!list.length) {
        casesImgsRead.setAttribute("hidden", "");
        casesImgsRead.innerHTML = "";
        return;
      }
      casesImgsRead.removeAttribute("hidden");
      casesImgsRead.innerHTML = "";
      for (var r = 0; r < list.length; r += 1) {
        var w = document.createElement("div");
        w.className = "skill-detail__case-thumb skill-detail__case-thumb--read";
        w.setAttribute("title", "点击查看大图");
        var im = document.createElement("img");
        im.src = list[r];
        im.alt = "案例配图 " + (r + 1);
        im.loading = "lazy";
        w.appendChild(im);
        casesImgsRead.appendChild(w);
      }
    }

    function performModalClose() {
      detailModalFromMine = false;
      detailModalFromFav = false;
      lastOpenedId = null;
      if (isCaseImageLightboxOpen()) {
        closeCaseImageLightbox();
      }
      if (fileCases) {
        fileCases.value = "";
      }
      if (fileCard) {
        fileCard.value = "";
      }
      root.setAttribute("hidden", "");
      root.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function focusAfterModalClose(fallback) {
      var t = fallback || lastActive;
      if (t && typeof t.focus === "function") {
        t.focus();
      }
    }

    /**
     * @param {void | (() => void)} onClosed
     */
    function closeModal(onClosed) {
      var surface = lastCardSurface;
      if (useSkillViewTransition() && surface && panelEl) {
        try {
          panelEl.style.setProperty("view-transition-name", "skill-open");
          var tr = document.startViewTransition(function () {
            performModalClose();
            if (panelEl) {
              panelEl.style.setProperty("view-transition-name", "none");
            }
            surface.style.setProperty("view-transition-name", "skill-open");
          });
          lastCardSurface = null;
          tr.finished
            .then(function () {
              if (panelEl) {
                panelEl.style.removeProperty("view-transition-name");
              }
              if (surface) {
                surface.style.removeProperty("view-transition-name");
              }
              if (surface && typeof surface.focus === "function") {
                surface.focus();
              } else {
                focusAfterModalClose();
              }
              if (onClosed) {
                onClosed();
              }
            })
            .catch(function () {
              if (panelEl) {
                panelEl.style.removeProperty("view-transition-name");
              }
              if (surface) {
                surface.style.removeProperty("view-transition-name");
              }
              focusAfterModalClose();
              if (onClosed) {
                onClosed();
              }
            });
        } catch (eVt) {
          performModalClose();
          lastCardSurface = null;
          focusAfterModalClose();
          if (onClosed) {
            onClosed();
          }
        }
      } else {
        performModalClose();
        lastCardSurface = null;
        focusAfterModalClose();
        if (onClosed) {
          onClosed();
        }
      }
    }

    function blurbText(it) {
      var dateLine = formatDate(it && it.createdAt) || "—";
      return "在一粟AI 中保存的常用项。本机时间：" + dateLine + "。可在新窗口中打开上面链接；数据仅存本机浏览器、不上传任何服务器。";
    }

    function openModal(it, fromMine, fromFav, cardSurface, opts) {
      lastActive = document.activeElement;
      lastOpenedId = it.id;
      var readOnlyMine = !!(opts && opts.readonlyMineDetail);
      function doOpen() {
        detailModalFromMine = !!fromMine && !readOnlyMine;
        detailModalFromFav = !!fromFav;
        modalCardImage = null;
        if (
          it &&
          it.cardImageDataUrl &&
          typeof it.cardImageDataUrl === "string" &&
          it.cardImageDataUrl.indexOf("data:image/") === 0 &&
          it.cardImageDataUrl.length <= MAX_DATA_URL_LEN
        ) {
          modalCardImage = it.cardImageDataUrl;
        }
        setDetailSkillLogo(it, modalCardImage);
        var title = (it.name && it.name.length) ? it.name : (it.url || "未命名");
        var lede = (it.url && String(it.url).trim()) || "—";
        var byHost = skillCardByline(it).replace(/^@/, "");
        var tEl = document.getElementById("skill-detail-title");
        var sEl = document.getElementById("skill-detail-sub");
        if (tEl) {
          tEl.textContent = title;
        }
        if (sEl) {
          sEl.textContent = lede;
        }
        var cat = document.getElementById("skill-detail-cat");
        var dev = document.getElementById("skill-detail-dev");
        var ver = document.getElementById("skill-detail-ver");
        var favCountEl = document.getElementById("skill-detail-fav-count");
        var oss = document.getElementById("skill-detail-oss");
        if (cat) {
          if (it.skillCategory != null && String(it.skillCategory).trim()) {
            cat.textContent = String(it.skillCategory).trim();
          } else {
            cat.textContent = detailGuessCategory(it.url);
          }
        }
        if (dev) {
          var devNick =
            it && it.authorDisplay != null && String(it.authorDisplay).trim()
              ? String(it.authorDisplay).trim()
              : getStoredProfileNickname();
          dev.textContent = devNick || byHost || "—";
        }
        if (ver) {
          ver.textContent = "v1.0";
        }
        if (favCountEl) {
          favCountEl.textContent = String(getSkillFavoriteCountForDisplay(it));
        }
        if (oss) {
          if (it.openSourceMode === "yes") {
            oss.textContent = "是";
          } else if (it.openSourceMode === "no") {
            oss.textContent = "否";
          } else {
            oss.textContent = detailIsOpenSource(it.url);
          }
        }
        var showMineEditor = !!fromMine && !readOnlyMine;
        if (btnCardEdit) {
          if (showMineEditor) {
            btnCardEdit.removeAttribute("hidden");
          } else {
            btnCardEdit.setAttribute("hidden", "");
          }
        }
        if (fileCard) {
          fileCard.disabled = !showMineEditor;
        }
        if (showMineEditor) {
          if (storeSec) {
            storeSec.setAttribute("hidden", "");
          }
          if (casesBlock) {
            casesBlock.setAttribute("hidden", "");
          }
          if (btnExpand) {
            btnExpand.setAttribute("hidden", "");
          }
          if (mineSec) {
            mineSec.removeAttribute("hidden");
          }
          if (taDetail) {
            taDetail.value = (it && it.detailIntro != null) ? String(it.detailIntro) : "";
          }
          modalCaseImages = normalizeDataUrlList(
            (it && it.featuredCasesImages) ? it.featuredCasesImages : []
          );
          renderCaseThumbsMine();
          if (fileCases) {
            fileCases.value = "";
          }
          if (fileCard) {
            fileCard.value = "";
          }
          if (descEl) {
            descEl.textContent = "";
          }
          if (casesP) {
            casesP.textContent = "";
          }
        } else {
          if (mineSec) {
            mineSec.setAttribute("hidden", "");
          }
          if (storeSec) {
            storeSec.removeAttribute("hidden");
          }
          if (casesBlock) {
            casesBlock.removeAttribute("hidden");
          }
          var dIntro = (it && it.detailIntro) ? String(it.detailIntro).trim() : "";
          var body = dIntro.length > 0 ? dIntro : blurbText(it);
          if (descEl) {
            descEl.textContent = body;
            descEl.classList.add("skill-detail__desc--clamp");
            descEl.classList.remove("is-expanded");
          }
          if (btnExpand) {
            btnExpand.setAttribute("aria-expanded", "false");
            if (body.length > 220) {
              btnExpand.removeAttribute("hidden");
              btnExpand.textContent = "展开";
            } else {
              btnExpand.setAttribute("hidden", "");
            }
          }
          var cBody = (it && it.featuredCases) ? String(it.featuredCases) : "";
          if (casesP) {
            if (cBody.length > 0) {
              casesP.textContent = cBody;
              casesP.removeAttribute("hidden");
            } else {
              casesP.textContent = "";
              casesP.setAttribute("hidden", "");
            }
          }
          renderCaseThumbsRead(
            (it && it.featuredCasesImages) ? it.featuredCasesImages : []
          );
        }
        if (cta) {
          cta.href = it.url || "#";
          cta.textContent = "打开链接";
        }
        if (footerEl) {
          footerEl.classList.toggle("skill-detail__footer--mine", !!showMineEditor);
        }
        if (btnCollect) {
          if (!fromMine && !fromFav) {
            btnCollect.removeAttribute("hidden");
            if (lastOpenedId && isFavoriteId(lastOpenedId)) {
              btnCollect.textContent = "已收藏";
              btnCollect.disabled = true;
            } else {
              btnCollect.textContent = "收藏链接";
              btnCollect.disabled = false;
            }
          } else {
            btnCollect.setAttribute("hidden", "");
            btnCollect.textContent = "收藏链接";
            btnCollect.disabled = false;
          }
        }
        if (btnUnfav) {
          if (fromFav && !fromMine) {
            btnUnfav.removeAttribute("hidden");
          } else {
            btnUnfav.setAttribute("hidden", "");
          }
        }
        root.removeAttribute("hidden");
        root.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        if (showMineEditor) {
          setTimeout(function () {
            if (taDetail) {
              taDetail.focus();
            }
          }, 0);
        } else {
          var closeBtn2 = document.getElementById("skill-detail-close");
          if (closeBtn2) {
            closeBtn2.focus();
          }
        }
      }
      if (useSkillViewTransition() && cardSurface && panelEl) {
        try {
          cardSurface.style.setProperty("view-transition-name", "skill-open");
          var vtr = document.startViewTransition(function () {
            doOpen();
            if (panelEl) {
              panelEl.style.setProperty("view-transition-name", "skill-open");
            }
            cardSurface.style.setProperty("view-transition-name", "none");
          });
          lastCardSurface = cardSurface;
          vtr.finished
            .then(function () {
              if (panelEl) {
                panelEl.style.removeProperty("view-transition-name");
              }
            })
            .catch(function () {
            });
        } catch (eVt) {
          doOpen();
          lastCardSurface = cardSurface || null;
        }
      } else {
        doOpen();
        lastCardSurface = cardSurface || null;
      }
    }

    var clos = root.querySelectorAll("[data-skill-detail-close]");
    for (var c = 0; c < clos.length; c += 1) {
      clos[c].addEventListener("click", function () {
        closeModal();
      });
    }

    if (btnCollect) {
      btnCollect.addEventListener("click", function () {
        if (detailModalFromMine || detailModalFromFav) {
          return;
        }
        if (!lastOpenedId) {
          return;
        }
        addFavoriteId(lastOpenedId);
        render();
        var itF = getItemById(lastOpenedId);
        var favEl = document.getElementById("skill-detail-fav-count");
        if (favEl && itF) {
          favEl.textContent = String(getSkillFavoriteCountForDisplay(itF));
        }
        if (btnCollect) {
          btnCollect.textContent = "已收藏";
          btnCollect.disabled = true;
        }
        if (window.alert) {
          window.alert("已加入「我的收藏」。可在侧栏「我的收藏」中查看。");
        }
      });
    }
    if (btnUnfav) {
      btnUnfav.addEventListener("click", function () {
        if (!detailModalFromFav || !lastOpenedId) {
          return;
        }
        removeFavoriteId(lastOpenedId);
        render();
        closeModal();
      });
    }

    if (btnShare) {
      btnShare.addEventListener("click", function () {
        if (!cta || !cta.getAttribute("href") || cta.getAttribute("href") === "#") {
          return;
        }
        var u = cta.href;
        var t = document.getElementById("skill-detail-title");
        if (navigator.share) {
          navigator
            .share({ title: t && t.textContent, url: u, text: t && t.textContent })
            .catch(function () {
            });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(u).then(function () {
            window.alert("已复制链接到剪贴板。");
          });
        } else {
          window.prompt("复制此链接", u);
        }
      });
    }

    if (btnExpand) {
      btnExpand.addEventListener("click", function () {
        if (!descEl || !descEl.textContent) {
          return;
        }
        var ex = descEl.classList.contains("is-expanded");
        if (ex) {
          descEl.classList.remove("is-expanded");
          btnExpand.setAttribute("aria-expanded", "false");
          btnExpand.textContent = "展开";
        } else {
          descEl.classList.add("is-expanded");
          btnExpand.setAttribute("aria-expanded", "true");
          btnExpand.textContent = "收起";
        }
      });
    }

    if (fileCases) {
      fileCases.addEventListener("change", function () {
        var list = fileCases.files;
        if (!list || !list.length) {
          return;
        }
        var room = MAX_CASE_IMAGES - modalCaseImages.length;
        if (room <= 0) {
          if (window.alert) {
            window.alert("最多 " + MAX_CASE_IMAGES + " 张。请先删除部分再添加。");
          }
          fileCases.value = "";
          return;
        }
        var maxUse = Math.min(list.length, room);
        var done = 0;
        function readNext() {
          if (done >= maxUse) {
            fileCases.value = "";
            return;
          }
          var f = list[done];
          done += 1;
          var r = new FileReader();
          r.onload = function (ev) {
            var d = ev && ev.target && ev.target.result;
            if (typeof d === "string") {
              if (d.length > MAX_DATA_URL_LEN) {
                if (window.alert) {
                  window.alert("有图片超过约 1.5MB 上限，已跳过该张。请改用小图后重选。");
                }
              } else if (modalCaseImages.length < MAX_CASE_IMAGES) {
                modalCaseImages.push(d);
                renderCaseThumbsMine();
              }
            }
            readNext();
          };
          r.onerror = function () {
            readNext();
          };
          r.readAsDataURL(f);
        }
        readNext();
      });
    }
    if (btnCardEdit && fileCard) {
      btnCardEdit.addEventListener("click", function () {
        if (!detailModalFromMine) {
          return;
        }
        fileCard.click();
      });
    }
    if (fileCard) {
      fileCard.addEventListener("change", function () {
        if (!detailModalFromMine) {
          return;
        }
        var f = fileCard.files && fileCard.files[0];
        fileCard.value = "";
        if (!f) {
          return;
        }
        var mime = String(f.type || "").toLowerCase();
        var looksImageMime = mime.indexOf("image/") === 0;
        var nameLower = String(f.name || "").toLowerCase();
        var looksImageExt = /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(nameLower);
        if (!looksImageMime && !looksImageExt) {
          if (window.alert) {
            window.alert("请选择 JPG、PNG、GIF 或 WebP 等图片文件。");
          }
          return;
        }
        if (f.size > 600 * 1024) {
          if (window.alert) {
            window.alert("图片请小于约 600KB。");
          }
          return;
        }
        var r = new FileReader();
        r.onerror = function () {
          if (window.alert) {
            window.alert("读取图片失败，请换一张重试。");
          }
        };
        r.onload = function (ev) {
          var d = ev && ev.target && ev.target.result;
          if (typeof d === "string") {
            if (d.length > MAX_DATA_URL_LEN) {
              if (window.alert) {
                window.alert("图片解码后仍过大，请换一张更小的图。");
              }
              return;
            }
            modalCardImage = d;
            setDetailSkillLogo(getItemById(lastOpenedId), d);
            if (lastOpenedId && d.length <= MAX_DATA_URL_LEN) {
              updateItemById(lastOpenedId, function (row) {
                row.cardImageDataUrl = d;
              });
              render();
            }
          }
        };
        r.readAsDataURL(f);
      });
    }
    if (casesThumbs) {
      casesThumbs.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.closest) {
          return;
        }
        var btn = t.closest("[data-case-img-remove]");
        if (btn) {
          var ix = parseInt(btn.getAttribute("data-case-img-remove"), 10);
          if (isNaN(ix)) {
            return;
          }
          modalCaseImages.splice(ix, 1);
          renderCaseThumbsMine();
          return;
        }
        if (t.closest && t.closest("img") && t.closest("#skill-detail-cases-thumbs")) {
          var im0 = t.closest("img");
          if (im0 && im0.src) {
            openCaseImageLightbox(im0.currentSrc || im0.src, im0.alt);
          }
        }
      });
    }

    if (casesImgsRead) {
      casesImgsRead.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.closest) {
          return;
        }
        var im = t.tagName === "IMG" ? t : t.closest("img");
        if (!im || !casesImgsRead.contains(im)) {
          return;
        }
        if (im.currentSrc || im.src) {
          openCaseImageLightbox(im.currentSrc || im.src, im.alt);
        }
      });
    }

    if (caseLightboxClose) {
      caseLightboxClose.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeCaseImageLightbox();
      });
    }
    if (caseLightboxBackdrop) {
      caseLightboxBackdrop.addEventListener("click", function (e) {
        e.preventDefault();
        closeCaseImageLightbox();
      });
    }

    if (btnSave) {
      btnSave.addEventListener("click", function () {
        if (!detailModalFromMine || !lastOpenedId) {
          return;
        }
        var a = (taDetail && String(taDetail.value)) || "";
        updateItemById(lastOpenedId, function (row) {
          row.detailIntro = a;
          if (
            modalCardImage &&
            typeof modalCardImage === "string" &&
            modalCardImage.indexOf("data:image/") === 0 &&
            modalCardImage.length <= MAX_DATA_URL_LEN
          ) {
            row.cardImageDataUrl = modalCardImage;
          } else {
            delete row.cardImageDataUrl;
          }
          if (modalCaseImages && modalCaseImages.length) {
            row.featuredCasesImages = normalizeFeaturedCaseImagesArr(modalCaseImages);
          } else {
            delete row.featuredCasesImages;
          }
        });
        render();
        if (window.alert) {
          window.alert("已保存到本机。与技能商店中同一条目同步。");
        }
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener("click", function () {
        if (!detailModalFromMine || !lastOpenedId) {
          return;
        }
        if (
          window.confirm(
            "将从本机永久删除该链接。若未事先导出 JSON，将无法恢复。是否删除？"
          )
        ) {
          var id = lastOpenedId;
          closeModal(function () {
            if (id) {
              deleteItem(id);
              render();
            }
          });
        }
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") {
        return;
      }
      if (isCaseImageLightboxOpen()) {
        e.preventDefault();
        closeCaseImageLightbox();
        return;
      }
      if (root.getAttribute("hidden") == null) {
        closeModal();
      }
    });

    function onSkillCardActivate(e) {
      var s = e.target && e.target.closest && e.target.closest(".skill-card__surface");
      if (!s) {
        return;
      }
      var li = s.closest(".skill-card");
      if (!li) {
        return;
      }
      var id = li.getAttribute("data-id");
      if (!id) {
        return;
      }
      var it = getItemById(id);
      if (it) {
        var fromMine = !!(li.closest && li.closest("#url-list-mine"));
        var fromFav = !!(li.closest && li.closest("#url-list-fav"));
        openModal(it, fromMine, fromFav, s, fromMine ? { readonlyMineDetail: true } : undefined);
      }
    }
    var storeUserSkillsEl = document.getElementById("store-user-skills");
    if (storeUserSkillsEl) {
      storeUserSkillsEl.addEventListener("click", onSkillCardActivate);
    }
    if (urlListMine) {
      urlListMine.addEventListener("click", onSkillCardActivate);
    }
    if (urlListFav) {
      urlListFav.addEventListener("click", onSkillCardActivate);
    }
  }

  initSkillDetailModal();

  function addSkillPageLikelyImageFile(f) {
    var mime = String(f.type || "").toLowerCase();
    var looksImageMime = mime.indexOf("image/") === 0;
    var nameLower = String(f.name || "").toLowerCase();
    var looksImageExt = /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(nameLower);
    return looksImageMime || looksImageExt;
  }

  function readAddSkillOneImageFile(f, cb) {
    if (!f) {
      cb(null, null);
      return;
    }
    if (!addSkillPageLikelyImageFile(f)) {
      cb("请选择 JPG、PNG、GIF 或 WebP 等图片文件。", null);
      return;
    }
    if (f.size > ADD_SKILL_IMAGE_FILE_MAX) {
      cb("每张图片请小于约 600KB。", null);
      return;
    }
    var r = new FileReader();
    r.onerror = function () {
      cb("读取图片失败，请换一张重试。", null);
    };
    r.onload = function (ev) {
      var d = ev && ev.target && ev.target.result;
      if (typeof d !== "string") {
        cb(null, null);
        return;
      }
      if (d.length > MAX_IMAGE_DATA_URL) {
        cb("图片解码后过大，请换一张更小的图。", null);
        return;
      }
      cb(null, d);
    };
    r.readAsDataURL(f);
  }

  function readAddSkillCaseImagesSequential(files, cb) {
    if (!files || !files.length) {
      cb(null, []);
      return;
    }
    var maxUse = Math.min(files.length, MAX_ADD_SKILL_CASE_IMAGES);
    var out = [];
    var idx = 0;
    function next() {
      if (idx >= maxUse) {
        cb(null, out);
        return;
      }
      var f = files[idx];
      idx += 1;
      readAddSkillOneImageFile(f, function (err, d) {
        if (err) {
          cb(err, null);
          return;
        }
        if (d) {
          out.push(d);
        }
        next();
      });
    }
    next();
  }

  function initAddSkillEditFormFields(it) {
    if (!it || !document.body.classList.contains("page-add-skill")) {
      return;
    }
    var titleEl = document.getElementById("add-skill-page-h1");
    var btnSubmit = document.querySelector("#add-form .btn--add");
    if (titleEl) {
      titleEl.textContent = "编辑技能";
    }
    if (btnSubmit) {
      btnSubmit.textContent = "保存";
    }
    if (nameInput) {
      nameInput.value = it.name != null ? String(it.name) : "";
    }
    if (urlInput) {
      urlInput.value = it.url != null ? String(it.url) : "";
    }
    var elIntro = document.getElementById("add-skill-detail-intro");
    if (elIntro) {
      elIntro.value = it.detailIntro != null ? String(it.detailIntro) : "";
    }
    addSkillCategoryLegacy = "";
    removeAddSkillCategoryLegacyOption();
    var elTop = document.getElementById("add-skill-category-top");
    var parsedCat = parseAddSkillCategory(it.skillCategory);
    if (parsedCat.legacy) {
      addSkillEcSub = "";
      addSkillCategoryLegacy = parsedCat.legacy;
      if (elTop) {
        ensureAddSkillCategoryLegacyOption(parsedCat.legacy);
        elTop.value = SKILL_CAT_LEGACY_TOKEN;
      }
      closeCategoryPicker();
      syncAddSkillCategoryFormToHidden();
    } else {
      addSkillEcSub = parsedCat.sub || "";
      if (elTop) {
        elTop.value = parsedCat.top || "";
      }
      closeCategoryPicker();
      syncAddSkillCategoryFormToHidden();
    }
    var elOs = document.getElementById("add-skill-open-source");
    if (elOs) {
      elOs.value = it.openSourceMode === "yes" ? "yes" : "no";
    }
    var cardWrap = document.getElementById("add-skill-card-preview");
    if (
      it.cardImageDataUrl &&
      typeof it.cardImageDataUrl === "string" &&
      it.cardImageDataUrl.indexOf("data:image/") === 0 &&
      it.cardImageDataUrl.length <= MAX_IMAGE_DATA_URL &&
      cardWrap
    ) {
      cardWrap.innerHTML = "";
      var im = document.createElement("img");
      im.className = "add-skill-avatar-preview__img";
      im.src = it.cardImageDataUrl;
      im.alt = "技能头像预览";
      im.decoding = "async";
      cardWrap.appendChild(im);
      cardWrap.removeAttribute("hidden");
    }
    setAddSkillPageTab(isSkillKnowledgeItem(it) ? "knowledge" : "url");
    syncAddSkillEditKindLock();
  }

  function initAddSkillImagePreviews() {
    var cardIn = document.getElementById("add-skill-card-file");
    var casesIn = document.getElementById("add-skill-cases-file");
    var cardWrap = document.getElementById("add-skill-card-preview");
    var casesWrap = document.getElementById("add-skill-cases-preview");
    var lb = document.getElementById("add-skill-preview-lightbox");
    var lbImg = document.getElementById("add-skill-preview-lightbox-img");
    var lbClose = document.getElementById("add-skill-preview-lightbox-close");
    var lbBackdrop = document.getElementById("add-skill-preview-lightbox-backdrop");
    var avatarFab = document.getElementById("add-skill-avatar-fab");
    if (!cardIn || !casesIn || !cardWrap || !casesWrap) {
      return;
    }

    if (!addSkillEditItemId) {
      addSkillManagedCaseImages = [];
      addSkillEcSub = "";
      addSkillCategoryLegacy = "";
      removeAddSkillCategoryLegacyOption();
      var etReset = document.getElementById("add-skill-category-top");
      var hiReset = document.getElementById("add-skill-category");
      var hlReset = document.getElementById("add-skill-category-legacy-hint");
      if (etReset) {
        etReset.value = "";
      }
      if (hiReset) {
        hiReset.value = "";
      }
      if (hlReset) {
        hlReset.setAttribute("hidden", "");
        hlReset.textContent = "";
      }
      closeCategoryPicker();
    }

    var casesFileBtn = document.getElementById("add-skill-cases-file-btn");
    var casesStatusEl = document.getElementById("add-skill-cases-file-status");
    function updateCasesFileStatus() {
      if (!casesStatusEl) {
        return;
      }
      if (addSkillEditItemId) {
        var nm = addSkillManagedCaseImages.length;
        casesStatusEl.textContent = nm ? "已添加 " + nm + " 张配图" : "未添加配图";
      } else {
        var nf = casesIn.files ? casesIn.files.length : 0;
        casesStatusEl.textContent = nf ? "已选择 " + nf + " 个文件" : "未选择文件";
      }
    }
    if (casesFileBtn && casesIn) {
      casesFileBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (typeof casesIn.click === "function") {
          casesIn.click();
        }
      });
    }

    if (avatarFab) {
      avatarFab.addEventListener("click", function (e) {
        e.preventDefault();
        cardIn.click();
      });
    }

    var cardBlobUrl = null;
    var caseBlobUrls = [];
    var lbOpen = false;

    function closeAddSkillLightbox() {
      if (!lb || !lbImg) {
        return;
      }
      lb.setAttribute("hidden", "");
      lb.setAttribute("aria-hidden", "true");
      lbImg.removeAttribute("src");
      lbImg.alt = "";
      document.body.style.overflow = "";
      lbOpen = false;
    }

    function openAddSkillLightbox(url, alt) {
      if (!lb || !lbImg || !url) {
        return;
      }
      lbImg.src = url;
      lbImg.alt = alt || "预览";
      lb.removeAttribute("hidden");
      lb.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      lbOpen = true;
      if (lbClose) {
        window.setTimeout(function () {
          lbClose.focus();
        }, 0);
      }
    }

    function onLbKeydown(e) {
      if (!lbOpen) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAddSkillLightbox();
      }
    }

    if (lbClose) {
      lbClose.addEventListener("click", function (e) {
        e.preventDefault();
        closeAddSkillLightbox();
      });
    }
    if (lbBackdrop) {
      lbBackdrop.addEventListener("click", function (e) {
        e.preventDefault();
        closeAddSkillLightbox();
      });
    }
    document.addEventListener("keydown", onLbKeydown);

    function revokeCardBlob() {
      if (cardBlobUrl) {
        try {
          URL.revokeObjectURL(cardBlobUrl);
        } catch (eRev) {}
        cardBlobUrl = null;
      }
    }

    function revokeCaseBlobs() {
      for (var ri = 0; ri < caseBlobUrls.length; ri += 1) {
        try {
          URL.revokeObjectURL(caseBlobUrls[ri]);
        } catch (eRev2) {}
      }
      caseBlobUrls = [];
    }

    function buildAddSkillThumb(url, alt, onRemove) {
      var wrap = document.createElement("div");
      wrap.className = "add-skill-thumb";
      var im = document.createElement("img");
      im.className = "add-skill-thumb__img";
      im.src = url;
      im.alt = alt;
      im.decoding = "async";
      im.addEventListener("click", function () {
        openAddSkillLightbox(url, alt);
      });
      var btnRm = document.createElement("button");
      btnRm.type = "button";
      btnRm.className = "add-skill-thumb__remove";
      btnRm.setAttribute("aria-label", "移除该图");
      btnRm.textContent = "×";
      btnRm.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      });
      wrap.appendChild(im);
      wrap.appendChild(btnRm);
      return wrap;
    }

    function removeCaseFileAt(fileIndex) {
      var list = casesIn.files;
      if (!list || fileIndex < 0 || fileIndex >= list.length) {
        return;
      }
      var dt = new DataTransfer();
      for (var i = 0; i < list.length; i += 1) {
        if (i !== fileIndex) {
          dt.items.add(list[i]);
        }
      }
      casesIn.files = dt.files;
      renderCasesPreview();
    }

    function renderCardPreview() {
      closeAddSkillLightbox();
      revokeCardBlob();
      cardWrap.innerHTML = "";
      var f = cardIn.files && cardIn.files[0];
      if (!f || !addSkillPageLikelyImageFile(f)) {
        cardWrap.setAttribute("hidden", "");
        return;
      }
      cardBlobUrl = URL.createObjectURL(f);
      var im = document.createElement("img");
      im.className = "add-skill-avatar-preview__img";
      im.src = cardBlobUrl;
      im.alt = "技能头像预览";
      im.decoding = "async";
      im.addEventListener("click", function () {
        openAddSkillLightbox(cardBlobUrl, "技能头像预览");
      });
      cardWrap.appendChild(im);
      cardWrap.removeAttribute("hidden");
    }

    function renderCasesPreview() {
      closeAddSkillLightbox();
      revokeCaseBlobs();
      casesWrap.innerHTML = "";
      var list = casesIn.files;
      if (!list || !list.length) {
        casesWrap.setAttribute("hidden", "");
        updateCasesFileStatus();
        return;
      }
      var shown = 0;
      for (var j = 0; j < list.length && shown < MAX_ADD_SKILL_CASE_IMAGES; j += 1) {
        var fi = list[j];
        if (!addSkillPageLikelyImageFile(fi)) {
          continue;
        }
        var u = URL.createObjectURL(fi);
        caseBlobUrls.push(u);
        shown += 1;
        (function (fileIndex, nLabel) {
          var thumb = buildAddSkillThumb(u, "案例配图 " + nLabel, function () {
            closeAddSkillLightbox();
            removeCaseFileAt(fileIndex);
          });
          casesWrap.appendChild(thumb);
        })(j, shown);
      }
      if (shown) {
        casesWrap.removeAttribute("hidden");
      } else {
        casesWrap.setAttribute("hidden", "");
      }
      updateCasesFileStatus();
    }

    function renderManagedCasesPreview() {
      closeAddSkillLightbox();
      revokeCaseBlobs();
      casesWrap.innerHTML = "";
      var n = addSkillManagedCaseImages.length;
      if (!n) {
        casesWrap.setAttribute("hidden", "");
        updateCasesFileStatus();
        return;
      }
      for (var ci = 0; ci < n; ci += 1) {
        var u = addSkillManagedCaseImages[ci];
        (function (ix) {
          var thumb = buildAddSkillThumb(u, "案例配图 " + (ix + 1), function () {
            closeAddSkillLightbox();
            addSkillManagedCaseImages.splice(ix, 1);
            renderManagedCasesPreview();
          });
          casesWrap.appendChild(thumb);
        })(ci);
      }
      casesWrap.removeAttribute("hidden");
      updateCasesFileStatus();
    }

    function handleCasesChangeForEdit() {
      closeAddSkillLightbox();
      var files = casesIn.files;
      if (!files || !files.length) {
        return;
      }
      var room = MAX_ADD_SKILL_CASE_IMAGES - addSkillManagedCaseImages.length;
      if (room <= 0) {
        showFormError(
          "最多 " + MAX_ADD_SKILL_CASE_IMAGES + " 张案例配图，请先删除某张再添加。"
        );
        casesIn.value = "";
        updateCasesFileStatus();
        return;
      }
      var dt = new DataTransfer();
      for (var fi = 0; fi < files.length && fi < room; fi += 1) {
        dt.items.add(files[fi]);
      }
      readAddSkillCaseImagesSequential(dt.files, function (errCases, arr) {
        casesIn.value = "";
        if (errCases) {
          showFormError(errCases);
          updateCasesFileStatus();
          return;
        }
        showFormError("");
        addSkillManagedCaseImages = normalizeFeaturedCaseImagesArr(
          addSkillManagedCaseImages.concat(arr || [])
        );
        renderManagedCasesPreview();
      });
    }

    cardIn.addEventListener("change", renderCardPreview);
    casesIn.addEventListener("change", function () {
      if (addSkillEditItemId) {
        handleCasesChangeForEdit();
      } else {
        renderCasesPreview();
      }
    });

    if (addSkillEditItemId) {
      var itEditLoad = getItemById(addSkillEditItemId);
      if (itEditLoad) {
        initAddSkillEditFormFields(itEditLoad);
        addSkillManagedCaseImages = normalizeFeaturedCaseImagesArr(
          itEditLoad.featuredCasesImages || []
        );
        renderManagedCasesPreview();
      } else {
        showFormError("未找到要编辑的技能，请从「我的技能」重新进入。");
        addSkillEditItemId = null;
        syncAddSkillEditKindLock();
      }
    }
    updateCasesFileStatus();
    syncAddSkillEditKindLock();
    wireAddSkillCategorySelects();
  }

  function submitAddSkillPage(name, raw) {
    var elIntro = document.getElementById("add-skill-detail-intro");
    syncAddSkillCategoryFormToHidden();
    var elCat = document.getElementById("add-skill-category");
    var elOs = document.getElementById("add-skill-open-source");
    var elCard = document.getElementById("add-skill-card-file");
    var elCases = document.getElementById("add-skill-cases-file");
    var detailIntro = elIntro ? String(elIntro.value || "").trim() : "";
    var skillCategory = elCat ? String(elCat.value || "").trim() : "";
    var openSourceMode = elOs ? String(elOs.value || "no") : "no";
    if (openSourceMode !== "yes" && openSourceMode !== "no") {
      openSourceMode = "no";
    }
    var isEdit = !!(addSkillEditItemId && getItemById(addSkillEditItemId));
    if (addSkillEditItemId && !isEdit) {
      showFormError("该技能已不存在或已被删除。");
      return;
    }
    var cardFile = elCard && elCard.files && elCard.files[0];
    var caseFiles = elCases && elCases.files ? elCases.files : null;
    readAddSkillOneImageFile(cardFile, function (errCard, cardUrl) {
      if (errCard) {
        showFormError(errCard);
        return;
      }
      function finishCases(errCases, caseArrFromFiles) {
        if (errCases) {
          showFormError(errCases);
          return;
        }
        var caseArrFinal = isEdit
          ? normalizeFeaturedCaseImagesArr(addSkillManagedCaseImages.slice())
          : caseArrFromFiles || [];
        var pageTabEl = document.querySelector(".add-skill-page");
        var isKnTabSubmit =
          pageTabEl && pageTabEl.classList.contains("add-skill-page--tab-knowledge");
        var skillKindOut = isKnTabSubmit ? "knowledge" : "url";
        if (isEdit) {
          var updated = updateItemById(addSkillEditItemId, function (row) {
            row.name = name;
            row.url = raw;
            row.skillKind = skillKindOut;
            if (detailIntro) {
              row.detailIntro = detailIntro;
            } else {
              delete row.detailIntro;
            }
            if (skillCategory) {
              row.skillCategory = skillCategory;
            } else {
              delete row.skillCategory;
            }
            row.openSourceMode = openSourceMode;
            if (cardUrl) {
              row.cardImageDataUrl = cardUrl;
            }
            if (caseArrFinal.length) {
              row.featuredCasesImages = caseArrFinal;
            } else {
              delete row.featuredCasesImages;
            }
          });
          if (!updated) {
            showFormError("保存失败：记录已不存在。");
            return;
          }
        } else {
          var opt = {
            detailIntro: detailIntro,
            skillCategory: skillCategory,
            skillKind: skillKindOut
          };
          if (caseArrFinal.length) {
            opt.featuredCasesImages = caseArrFinal;
          }
          opt.openSourceMode = openSourceMode;
          if (cardUrl) {
            opt.cardImageDataUrl = cardUrl;
          }
          addItem(name, raw, opt);
        }
        showFormError("");
        location.href = "index.html#my-skills";
      }
      if (isEdit) {
        finishCases(null, []);
      } else {
        readAddSkillCaseImagesSequential(caseFiles, finishCases);
      }
    });
  }

  function setAddSkillPageTab(which) {
    var page = document.querySelector(".add-skill-page");
    var tabUrl = document.getElementById("add-skill-tab-url");
    var tabKn = document.getElementById("add-skill-tab-knowledge");
    if (!page || !tabUrl || !tabKn) {
      return;
    }
    var isK = which === "knowledge";
    page.classList.toggle("add-skill-page--tab-knowledge", isK);
    page.classList.toggle("add-skill-page--tab-url", !isK);
    tabUrl.setAttribute("aria-selected", String(!isK));
    tabKn.setAttribute("aria-selected", String(isK));
    if (urlInput) {
      if (isK) {
        urlInput.removeAttribute("required");
      } else {
        urlInput.setAttribute("required", "");
      }
    }
  }

  function syncAddSkillEditKindLock() {
    var page = document.querySelector(".add-skill-page");
    var tabUrl = document.getElementById("add-skill-tab-url");
    var tabKn = document.getElementById("add-skill-tab-knowledge");
    if (!page || !tabUrl || !tabKn) {
      return;
    }
    if (!addSkillEditItemId) {
      page.removeAttribute("data-edit-kind-lock");
      tabUrl.disabled = false;
      tabKn.disabled = false;
      tabUrl.removeAttribute("aria-disabled");
      tabKn.removeAttribute("aria-disabled");
      tabUrl.removeAttribute("title");
      tabKn.removeAttribute("title");
      return;
    }
    var itLock = getItemById(addSkillEditItemId);
    if (!itLock) {
      page.removeAttribute("data-edit-kind-lock");
      tabUrl.disabled = false;
      tabKn.disabled = false;
      tabUrl.removeAttribute("aria-disabled");
      tabKn.removeAttribute("aria-disabled");
      tabUrl.removeAttribute("title");
      tabKn.removeAttribute("title");
      return;
    }
    if (!shouldLockAddSkillEditTabs(itLock)) {
      page.removeAttribute("data-edit-kind-lock");
      tabUrl.disabled = false;
      tabKn.disabled = false;
      tabUrl.removeAttribute("aria-disabled");
      tabKn.removeAttribute("aria-disabled");
      tabUrl.removeAttribute("title");
      tabKn.removeAttribute("title");
      return;
    }
    page.setAttribute("data-edit-kind-lock", "1");
    var isK = isSkillKnowledgeItem(itLock);
    if (isK) {
      tabUrl.disabled = true;
      tabKn.disabled = false;
      tabUrl.setAttribute("aria-disabled", "true");
      tabKn.removeAttribute("aria-disabled");
      tabUrl.title = "编辑知识类技能时不可切换到添加网址";
      tabKn.removeAttribute("title");
    } else {
      tabUrl.disabled = false;
      tabKn.disabled = true;
      tabUrl.removeAttribute("aria-disabled");
      tabKn.setAttribute("aria-disabled", "true");
      tabKn.title = "编辑网址类技能时不可切换到添加知识";
      tabUrl.removeAttribute("title");
    }
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      showFormError("");
      var name = normalizeName((nameInput && nameInput.value) || "");
      var raw = urlInput ? String(urlInput.value).trim() : "";
      if (document.body.classList.contains("page-add-skill")) {
        var pageTab = document.querySelector(".add-skill-page");
        var isKnTab = pageTab && pageTab.classList.contains("add-skill-page--tab-knowledge");
        var isEditSkill = !!(addSkillEditItemId && getItemById(addSkillEditItemId));
        if (isKnTab) {
          if (!isEditSkill) {
            raw = ADD_SKILL_KNOWLEDGE_URL_PLACEHOLDER;
          } else if (!raw || !isValidUrlString(raw)) {
            raw = ADD_SKILL_KNOWLEDGE_URL_PLACEHOLDER;
          }
        } else {
          if (!raw) {
            showFormError("请先填写「URL」再提交。");
            return;
          }
          if (!isValidUrlString(raw)) {
            showFormError("请填写以 http:// 或 https:// 开头的有效网址。");
            return;
          }
        }
        submitAddSkillPage(name, raw);
        return;
      }
      if (!raw) {
        showFormError("请先填写「URL」再提交。");
        return;
      }
      if (!isValidUrlString(raw)) {
        showFormError("请填写以 http:// 或 https:// 开头的有效网址。");
        return;
      }
      addItem(name, raw);
      showFormError("");
      form.reset();
      render();
    });
  }

  if (document.body.classList.contains("page-add-skill")) {
    addSkillEditItemId = getAddSkillEditIdFromUrl();
    (function initAddSkillSubnavTabs() {
      var page = document.querySelector(".add-skill-page");
      var tabUrl = document.getElementById("add-skill-tab-url");
      var tabKn = document.getElementById("add-skill-tab-knowledge");
      if (!page || !tabUrl || !tabKn) {
        return;
      }
      var editIdForNav = getAddSkillEditIdFromUrl();
      function applyInitialAddSkillTabFromEditOrHash() {
        if (editIdForNav) {
          var itNav = getItemById(editIdForNav);
          if (itNav) {
            setAddSkillPageTab(isSkillKnowledgeItem(itNav) ? "knowledge" : "url");
            return;
          }
        }
        var h0 = (location.hash || "").replace(/^#/, "");
        if (h0 === "add-skill-detail-intro" || h0 === "knowledge") {
          setAddSkillPageTab("knowledge");
        } else {
          setAddSkillPageTab("url");
        }
      }
      applyInitialAddSkillTabFromEditOrHash();
      tabUrl.addEventListener("click", function () {
        if (page.getAttribute("data-edit-kind-lock") === "1") {
          return;
        }
        setAddSkillPageTab("url");
      });
      tabKn.addEventListener("click", function () {
        if (page.getAttribute("data-edit-kind-lock") === "1") {
          return;
        }
        setAddSkillPageTab("knowledge");
      });
      window.addEventListener("hashchange", function () {
        if (page.getAttribute("data-edit-kind-lock") === "1" && addSkillEditItemId) {
          var itH = getItemById(addSkillEditItemId);
          if (itH) {
            setAddSkillPageTab(isSkillKnowledgeItem(itH) ? "knowledge" : "url");
          }
          return;
        }
        var h2 = (location.hash || "").replace(/^#/, "");
        if (h2 === "add-skill-detail-intro" || h2 === "knowledge") {
          setAddSkillPageTab("knowledge");
        } else if (h2 === "url" || h2 === "") {
          setAddSkillPageTab("url");
        }
      });
    })();
    initAddSkillImagePreviews();
  }

  function onFilterInput(e) {
    if (e && e.target) {
      listFilterQ = e.target.value;
    }
    syncListControls();
    render();
  }
  function onSortChange(e) {
    if (e && e.target) {
      listSortV = e.target.value || "new";
    }
    syncListControls();
    render();
  }
  if (listFilter) listFilter.addEventListener("input", onFilterInput);
  if (listSort) listSort.addEventListener("change", onSortChange);

  function parseImportData(text) {
    var data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("文件须为 JSON 数组，每项应包含 url 等字段。");
    var out = [];
    for (var i = 0; i < data.length; i += 1) {
      var r = data[i];
      if (!r || typeof r !== "object") continue;
      var u = (r.url != null) ? String(r.url).trim() : "";
      if (!u || !isValidUrlString(u)) continue;
      var entry = {
        id: (r.id && String(r.id)) || (self.crypto && crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + i),
        name: normalizeName(r.name),
        url: u,
        createdAt: r.createdAt && String(r.createdAt) || new Date().toISOString(),
        detailIntro: r.detailIntro != null && String(r.detailIntro).length ? String(r.detailIntro) : undefined,
        featuredCases: r.featuredCases != null && String(r.featuredCases).length ? String(r.featuredCases) : undefined
      };
      if (r.skillCategory != null && String(r.skillCategory).trim()) {
        entry.skillCategory = String(r.skillCategory).trim();
      }
      if (r.openSourceMode === "yes" || r.openSourceMode === "no") {
        entry.openSourceMode = r.openSourceMode;
      }
      if (
        r.cardImageDataUrl &&
        typeof r.cardImageDataUrl === "string" &&
        r.cardImageDataUrl.indexOf("data:image/") === 0 &&
        r.cardImageDataUrl.length <= MAX_IMAGE_DATA_URL
      ) {
        entry.cardImageDataUrl = r.cardImageDataUrl;
      }
      if (Array.isArray(r.featuredCasesImages) && r.featuredCasesImages.length) {
        var fci = [];
        for (var fi = 0; fi < r.featuredCasesImages.length && fci.length < MAX_ADD_SKILL_CASE_IMAGES; fi += 1) {
          var s = r.featuredCasesImages[fi];
          if (typeof s === "string" && s.indexOf("data:image/") === 0 && s.length <= MAX_IMAGE_DATA_URL) {
            fci.push(s);
          }
        }
        if (fci.length) {
          entry.featuredCasesImages = fci;
        }
      }
      if (r.favoriteCount != null) {
        var fcImp = Math.floor(Number(r.favoriteCount));
        if (isFinite(fcImp) && fcImp > 0) {
          entry.favoriteCount = fcImp;
        }
      }
      out.push(entry);
    }
    return out;
  }

  function getImportMode() {
    var checked = document.querySelector('input[name="import-mode"]:checked');
    return (checked && checked.value) || "merge";
  }

  if (btnExport) {
    btnExport.addEventListener("click", function () {
      var items = getItems();
      var json = JSON.stringify(items, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "agent-urls-" + (new Date().toISOString().slice(0, 10)) + ".json";
      a.rel = "noopener";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 0);
      showImportError("");
      showImportOk("已开始下载 JSON 文件。");
    });
  }

  if (importFile) {
    importFile.addEventListener("change", function () {
      showImportError("");
      showImportOk("");
      var f = importFile.files && importFile.files[0];
      importFile.value = "";
      if (!f) return;
      var mode = getImportMode();
      if (mode === "replace") {
        if (!window.confirm("将用所选文件替换本机全部链接。未事先导出的记录会永久消失。是否继续？")) {
          return;
        }
      }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var incoming = parseImportData(String(reader.result || ""));
          if (mode === "replace") {
            setItems(incoming);
            setFavoriteIds([]);
          } else {
            var current = getItems();
            var seen = {};
            var merged = [];
            for (var i = 0; i < incoming.length; i += 1) {
              var x = incoming[i];
              if (seen[x.url]) continue;
              seen[x.url] = true;
              merged.push(x);
            }
            for (var j = 0; j < current.length; j += 1) {
              if (!seen[current[j].url]) {
                seen[current[j].url] = true;
                merged.push(current[j]);
              }
            }
            setItems(merged);
          }
          pruneFavoriteOrphans();
          showImportOk("已导入，当前共 " + getItems().length + " 条。");
          render();
          if (typeof window.__skillsCloudRefresh === "function") {
            window.__skillsCloudRefresh();
          }
        } catch (err) {
          showImportError("未导入成功：" + (err && err.message ? err.message : "文件无法解析，请检查是否为有效 JSON 数组。"));
        }
      };
      reader.onerror = function () {
        showImportError("读文件失败。请重试，或另选文件。");
      };
      reader.readAsText(f, "utf-8");
    });
  }

  render();

  var HASH_HOME = "top";
  var HASH_STORE = "store-user-skills";
  var HASH_MINE = "my-skills";
  var HASH_FAV = "my-favorites";

  function getViewNameFromHash() {
    var raw = (location.hash || "").replace(/^#/, "");
    if (raw === HASH_STORE || raw === "store" || raw === "strategic-map") return "store";
    if (raw === HASH_MINE || raw === "mine") return "mine";
    if (raw === HASH_FAV || raw === "fav" || raw === "favorites") return "fav";
    return "home";
  }

  function setAppView(name) {
    var main = document.querySelector(".app-main");
    var n =
      name === "store" || name === "mine" || name === "home" || name === "fav" ? name : "home";
    if (main) {
      if (main.classList) {
        main.classList.remove(
          "app-main--view-home",
          "app-main--view-store",
          "app-main--view-mine",
          "app-main--view-fav"
        );
        main.classList.add("app-main--view-" + n);
      } else {
        main.className =
          main.className.replace(/\bapp-main--view-\w+\b/g, "") + " app-main--view-" + n;
      }
    }
    var vHub = document.querySelector('.app-view[data-app-view="hub"]');
    var vMine = document.querySelector('.app-view[data-app-view="mine"]');
    var vFav = document.querySelector('.app-view[data-app-view="fav"]');
    if (vHub) {
      if (n === "home" || n === "store") {
        vHub.removeAttribute("hidden");
      } else {
        vHub.setAttribute("hidden", "");
      }
    }
    if (vMine) {
      if (n === "mine") {
        vMine.removeAttribute("hidden");
      } else {
        vMine.setAttribute("hidden", "");
      }
    }
    if (vFav) {
      if (n === "fav") {
        vFav.removeAttribute("hidden");
      } else {
        vFav.setAttribute("hidden", "");
      }
    }
    if (listFilter) {
      if (n === "mine") {
        listFilter.setAttribute("aria-label", "按名称或地址搜索我的技能");
      } else if (n === "fav") {
        listFilter.setAttribute("aria-label", "按名称或地址搜索我的收藏");
      } else {
        listFilter.setAttribute("aria-label", "按名称或地址搜索技能列表");
      }
    }
    if (typeof document !== "undefined") {
      var titleMap = {
        home: "首页 - 一粟AI",
        store: "技能商店 - 一粟AI",
        mine: "我的技能 - 一粟AI",
        fav: "我的收藏 - 一粟AI"
      };
      document.title = titleMap[n] || "一粟AI";
    }
    var navLinks = document.querySelectorAll(".app-nav a[data-app-nav]");
    for (var j = 0; j < navLinks.length; j += 1) {
      var a = navLinks[j];
      if (a.getAttribute("data-app-nav") === n) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    /** 侧栏切换视图时从文档最顶开始；不用 scrollIntoView(列表块)，否则会顶走顶栏。hash 含 #store-user-skills 等时浏览器还会异步滚到锚点，故在后续帧再置顶一次。 */
    function alignScrollToDocumentTop() {
      window.scrollTo(0, 0);
      try {
        if (document.documentElement) {
          document.documentElement.scrollTop = 0;
        }
        if (document.body) {
          document.body.scrollTop = 0;
        }
      } catch (eScroll) {}
    }
    alignScrollToDocumentTop();
    requestAnimationFrame(function () {
      alignScrollToDocumentTop();
      requestAnimationFrame(function () {
        alignScrollToDocumentTop();
        try {
          setTimeout(alignScrollToDocumentTop, 0);
        } catch (eT) {}
      });
    });
  }

  function initAppView() {
    var nav = document.querySelector(".app-nav");
    if (!nav) return;
    if (!document.getElementById("top")) {
      return;
    }
    var isFirstViewApply = true;

    function withViewTransition(fn) {
      if (isFirstViewApply) {
        isFirstViewApply = false;
        fn();
        return;
      }
      if (document.startViewTransition) {
        document.startViewTransition(fn);
      } else {
        fn();
      }
    }

    function applyFromHash() {
      var raw = (location.hash || "").replace(/^#/, "");
      var v = getViewNameFromHash();
      withViewTransition(function () {
        setAppView(v);
      });
      if (v === "store" && raw === "strategic-map" && history.replaceState) {
        try {
          history.replaceState(null, "", "#" + HASH_STORE);
        } catch (e1) {
        }
      }
    }
    nav.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("a[data-app-nav]");
      if (!t) return;
      e.preventDefault();
      var v = t.getAttribute("data-app-nav");
      if (!v) return;
      var h =
        { home: HASH_HOME, store: HASH_STORE, mine: HASH_MINE, fav: HASH_FAV }[v] || HASH_HOME;
      if (location.hash === "#" + h) {
        withViewTransition(function () {
          setAppView(v);
        });
      } else {
        location.hash = h;
      }
    });
    window.addEventListener("hashchange", applyFromHash);
    applyFromHash();
  }

  initAppView();

  function initSidebarToggle() {
    var shell = document.getElementById("app-shell");
    var btn = document.getElementById("sidebar-toggle");
    var COLLAPSE_KEY = "agent_sidebar_collapsed";
    if (!shell || !btn) return;
    var mq = window.matchMedia("(max-width: 900px)");

    function isMobile() {
      return mq.matches;
    }

    function setButtonState(collapsed) {
      if (collapsed) {
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-label", "展开侧栏");
        btn.setAttribute("title", "展开侧栏");
      } else {
        btn.setAttribute("aria-expanded", "true");
        btn.setAttribute("aria-label", "收起侧栏");
        btn.setAttribute("title", "收起侧栏");
      }
    }

    function applyFromStorage() {
      if (isMobile()) {
        shell.classList.remove("app-shell--sidebar-collapsed");
        setButtonState(false);
        return;
      }
      if (localStorage.getItem(COLLAPSE_KEY) === "1") {
        shell.classList.add("app-shell--sidebar-collapsed");
        setButtonState(true);
      } else {
        shell.classList.remove("app-shell--sidebar-collapsed");
        setButtonState(false);
      }
    }

    function onToggle() {
      if (isMobile()) return;
      var next = !shell.classList.contains("app-shell--sidebar-collapsed");
      if (next) {
        shell.classList.add("app-shell--sidebar-collapsed");
        localStorage.setItem(COLLAPSE_KEY, "1");
        setButtonState(true);
      } else {
        shell.classList.remove("app-shell--sidebar-collapsed");
        localStorage.setItem(COLLAPSE_KEY, "0");
        setButtonState(false);
      }
    }

    applyFromStorage();
    if (mq.addEventListener) {
      mq.addEventListener("change", applyFromStorage);
    } else {
      mq.addListener(applyFromStorage);
    }
    btn.addEventListener("click", onToggle);
  }

  initSidebarToggle();

  var MODE_KEY = "agent_color_mode";

  function getColorMode() {
    var v = localStorage.getItem(MODE_KEY);
    if (v === "light" || v === "dark") {
      return "system";
    }
    if (v === "system") {
      return "system";
    }
    return "system";
  }

  /** 用户菜单「主题」一行：仅跟随系统，在春花（默认粉系）/ 森林色板间切换 */
  function themeMenuLabel() {
    if (getThemePalette() === "forest") {
      return "跟随系统 · 森林";
    }
    return "跟随系统 · 春花";
  }

  var THEME_PRESETS = [
    { mode: "system", palette: "default" },
    { mode: "system", palette: "forest" }
  ];

  function indexOfCurrentThemePreset() {
    var m = getColorMode();
    var p = getThemePalette();
    var i;
    for (i = 0; i < THEME_PRESETS.length; i += 1) {
      if (THEME_PRESETS[i].mode === m && THEME_PRESETS[i].palette === p) {
        return i;
      }
    }
    return 0;
  }

  function setColorMode(m) {
    if (m !== "system") {
      m = "system";
    }
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch (e) {
    }
    document.documentElement.setAttribute("data-agent-color-mode", m);
  }

  var PALETTE_KEY = "agent_theme_palette";

  function getThemePalette() {
    var pv = localStorage.getItem(PALETTE_KEY);
    if (pv === "forest") {
      return "forest";
    }
    return "default";
  }

  function setThemePalette(p) {
    if (p !== "forest" && p !== "default") {
      p = "default";
    }
    try {
      localStorage.setItem(PALETTE_KEY, p);
    } catch (ePal) {
    }
    document.documentElement.setAttribute("data-agent-theme-palette", p);
  }

  function migrateLegacyColorMode() {
    var v = localStorage.getItem(MODE_KEY);
    if (v === "light" || v === "dark") {
      setColorMode("system");
    }
  }

  function initUserMenu() {
    migrateLegacyColorMode();
    if (window.__butterflyAuthSync) {
      window.__butterflyAuthSync();
    }
    var wrap = document.getElementById("app-user-wrap");
    var trigger = document.getElementById("app-user-trigger");
    var menu = document.getElementById("app-user-menu");
    var themeLabel = document.getElementById("app-user-menu-theme-label");
    var themeBtn = document.getElementById("app-user-menu-theme");
    var settingsBtn = document.getElementById("app-user-menu-settings");
    var contactBtn = document.getElementById("app-user-menu-contact");
    var logout = document.getElementById("app-user-menu-logout");
    var appShell = document.getElementById("app-shell");
    if (!wrap || !trigger || !menu) {
      return;
    }

    setThemePalette(getThemePalette());
    if (themeLabel) {
      themeLabel.textContent = themeMenuLabel();
    }

    var GAP = 6;
    var onWinResize;
    var onScrollAny;

    function isSidebarCollapsed() {
      return appShell && appShell.classList.contains("app-shell--sidebar-collapsed");
    }

    function isMobileLayout() {
      if (window.matchMedia) {
        return window.matchMedia("(max-width: 900px)").matches;
      }
      return window.innerWidth <= 900;
    }

    function placeUserMenu() {
      if (menu.getAttribute("hidden") != null) {
        return;
      }
      var r = trigger.getBoundingClientRect();
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var pad = 8;
      menu.removeAttribute("style");
      menu.style.cssText = "";
      menu.style.position = "fixed";
      menu.style.zIndex = "10000";
      menu.style.boxSizing = "border-box";
      var mh;
      if (isSidebarCollapsed() && !isMobileLayout()) {
        var mw0 = Math.min(240, Math.max(200, vw - r.right - GAP * 2 - pad * 2));
        menu.style.width = mw0 + "px";
        menu.style.maxHeight = Math.min(0.7 * vh, 420) + "px";
        menu.style.overflowY = "auto";
        mh = menu.offsetHeight;
        menu.style.left = Math.min(r.right + GAP, vw - mw0 - pad) + "px";
        var tCol = r.top + r.height / 2 - mh / 2;
        tCol = Math.max(pad, Math.min(tCol, vh - mh - pad));
        menu.style.top = tCol + "px";
        menu.style.right = "auto";
        menu.style.bottom = "auto";
      } else {
        var w0 = Math.max(200, Math.min(r.width, 240));
        if (r.left + w0 > vw - pad) {
          w0 = Math.min(w0, vw - pad * 2);
        }
        menu.style.width = w0 + "px";
        var left0 = r.left;
        if (left0 + w0 > vw - pad) {
          left0 = Math.max(pad, vw - w0 - pad);
        } else {
          left0 = Math.max(pad, left0);
        }
        menu.style.left = left0 + "px";
        menu.style.maxHeight = Math.min(0.7 * vh, 420) + "px";
        menu.style.overflowY = "auto";
        mh = menu.offsetHeight;
        var spaceBelow = vh - r.bottom - GAP;
        var spaceAbove = r.top - GAP;
        var canBelow = spaceBelow >= 100 || (spaceBelow >= 60 && spaceBelow > spaceAbove);
        if (canBelow) {
          var t2 = r.bottom + GAP;
          if (t2 + mh > vh - pad) {
            t2 = Math.max(pad, vh - pad - mh);
          }
          menu.style.top = t2 + "px";
        } else {
          var t0 = r.top - GAP - mh;
          t0 = Math.max(pad, t0);
          if (t0 + mh > vh - pad) {
            t0 = Math.max(pad, vh - pad - mh);
          }
          menu.style.top = t0 + "px";
        }
        menu.style.right = "auto";
        menu.style.bottom = "auto";
      }
    }

    function isOpen() {
      return trigger.getAttribute("aria-expanded") === "true";
    }

    function openMenu() {
      trigger.setAttribute("aria-expanded", "true");
      if (themeLabel) {
        themeLabel.textContent = themeMenuLabel();
      }
      if (onWinResize) {
        window.removeEventListener("resize", onWinResize, false);
        onWinResize = null;
      }
      if (onScrollAny) {
        document.removeEventListener("scroll", onScrollAny, true);
        onScrollAny = null;
      }
      requestAnimationFrame(function () {
        menu.removeAttribute("hidden");
        requestAnimationFrame(function () {
          placeUserMenu();
        });
      });
      onWinResize = function () {
        if (isOpen()) {
          placeUserMenu();
        }
      };
      window.addEventListener("resize", onWinResize, false);
      onScrollAny = function () {
        if (isOpen()) {
          placeUserMenu();
        }
      };
      document.addEventListener("scroll", onScrollAny, true);
    }

    function closeMenu() {
      if (onWinResize) {
        window.removeEventListener("resize", onWinResize, false);
        onWinResize = null;
      }
      if (onScrollAny) {
        document.removeEventListener("scroll", onScrollAny, true);
        onScrollAny = null;
      }
      menu.setAttribute("hidden", "");
      menu.removeAttribute("style");
      trigger.setAttribute("aria-expanded", "false");
    }

    function toggleMenu() {
      if (isOpen()) {
        closeMenu();
      } else {
        openMenu();
      }
    }

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMenu();
    });

    document.addEventListener("click", function (e) {
      if (!isOpen()) {
        return;
      }
      if (wrap.contains(e.target)) {
        return;
      }
      closeMenu();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) {
        closeMenu();
        trigger.focus();
      }
    });

    if (themeBtn) {
      themeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var ix = indexOfCurrentThemePreset();
        var next = THEME_PRESETS[(ix + 1) % THEME_PRESETS.length];
        setColorMode(next.mode);
        setThemePalette(next.palette);
        if (themeLabel) {
          themeLabel.textContent = themeMenuLabel();
        }
      });
    }

    if (settingsBtn) {
      settingsBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeMenu();
        if (typeof window.openAppSettings === "function") {
          window.openAppSettings();
        }
      });
    }

    if (contactBtn) {
      contactBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeMenu();
        window.alert("本机工具，无在线客服。可通过你提供的反馈渠道或项目仓库联系。");
      });
    }

    if (logout) {
      logout.addEventListener("click", function (e) {
        var ba = window.__butterflyAuth;
        if (ba && ba.isConfigured && ba.isConfigured()) {
          e.preventDefault();
          closeMenu();
          ba.signOut()
            .then(function () {
              window.location.href = "login.html";
            })
            .catch(function () {
              window.location.href = "login.html";
            });
          return;
        }
        closeMenu();
      });
    }
  }

  function loadSettingsProfile() {
    try {
      var raw = localStorage.getItem(SETTINGS_PROFILE_KEY);
      if (!raw) {
        return { nickname: "", bio: "", avatarDataUrl: "" };
      }
      var o = JSON.parse(raw);
      return {
        nickname: o.nickname || "",
        bio: o.bio || "",
        avatarDataUrl: o.avatarDataUrl || "",
      };
    } catch (e2) {
      return { nickname: "", bio: "", avatarDataUrl: "" };
    }
  }

  function saveSettingsProfile(p) {
    localStorage.setItem(SETTINGS_PROFILE_KEY, JSON.stringify(p));
  }

  function initSettingsOverlay() {
    var root = document.getElementById("app-settings");
    if (!root) {
      return;
    }

    var backdrop = document.getElementById("app-settings-backdrop");
    var closeBtn = document.getElementById("app-settings-close");
    var navBtns = root.querySelectorAll("[data-settings-panel]");
    var panelIds = ["profile", "general", "apps", "about", "policies", "account"];
    var panels = {};
    var i;
    for (i = 0; i < panelIds.length; i++) {
      panels[panelIds[i]] = document.getElementById("settings-panel-" + panelIds[i]);
    }

    var elNickname = document.getElementById("settings-nickname");
    var elBio = document.getElementById("settings-bio");
    var elBioCount = document.getElementById("settings-bio-count");
    var elAvatarImg = document.getElementById("settings-avatar-img");
    var elAvatarInput = document.getElementById("settings-avatar-input");
    var elAvatarBtn = document.getElementById("settings-avatar-btn");
    var elSave = document.getElementById("settings-save-profile");
    var elToast = document.getElementById("settings-profile-toast");
    var elAccountLine = document.getElementById("settings-account-line");

    function applyProfileToForm() {
      var p = loadSettingsProfile();
      if (elNickname) {
        elNickname.value = p.nickname;
      }
      if (elBio) {
        elBio.value = p.bio;
      }
      updateBioCount();
      if (elAvatarImg) {
        elAvatarImg.src = p.avatarDataUrl || "logo-yisuai.png";
      }
    }

    function updateBioCount() {
      if (!elBio || !elBioCount) {
        return;
      }
      elBioCount.textContent = elBio.value.length + "/50";
    }

    function refreshAccountPanel() {
      if (!elAccountLine) {
        return;
      }
      var ba = window.__butterflyAuth;
      if (ba && ba.isConfigured && ba.isConfigured()) {
        ba.getSession().then(function (res) {
          var em =
            res &&
            res.data &&
            res.data.session &&
            res.data.session.user &&
            res.data.session.user.email;
          elAccountLine.textContent = em
            ? "当前登录邮箱：" + em + "。个人信息保存后将同步至云端；重置密码请通过登录页或项目邮件模板。"
            : "未检测到登录会话，可在登录页注册或登录。";
        });
      } else {
        elAccountLine.textContent =
          "登录邮箱与密码请在登录页管理。未配置云端时，下方资料仍保存在本机。";
      }
    }

    function openSettings() {
      root.removeAttribute("hidden");
      root.setAttribute("aria-hidden", "false");
      try {
        document.documentElement.style.overflow = "hidden";
      } catch (e3) {}
      var ba = window.__butterflyAuth;
      function doneOpen() {
        applyProfileToForm();
        refreshAccountPanel();
        if (closeBtn) {
          closeBtn.focus();
        }
      }
      if (ba && ba.isConfigured && ba.isConfigured() && typeof window.__profileCloudPull === "function") {
        window.__profileCloudPull().then(doneOpen).catch(doneOpen);
      } else {
        doneOpen();
      }
    }

    function closeSettings() {
      root.setAttribute("hidden", "");
      root.setAttribute("aria-hidden", "true");
      try {
        document.documentElement.style.overflow = "";
      } catch (e4) {}
      if (elToast) {
        elToast.setAttribute("hidden", "");
      }
    }

    window.openAppSettings = openSettings;

    if (backdrop) {
      backdrop.addEventListener("click", closeSettings);
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", closeSettings);
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape" || root.hasAttribute("hidden")) {
        return;
      }
      closeSettings();
    });

    navBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-settings-panel");
        navBtns.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        var k;
        for (k = 0; k < panelIds.length; k++) {
          var key = panelIds[k];
          var panel = panels[key];
          if (!panel) {
            continue;
          }
          var show = key === id;
          panel.classList.toggle("is-visible", show);
          panel.setAttribute("aria-hidden", show ? "false" : "true");
        }
        if (id === "account") {
          refreshAccountPanel();
        }
      });
    });

    if (elBio) {
      elBio.addEventListener("input", updateBioCount);
    }

    if (elAvatarBtn && elAvatarInput) {
      elAvatarBtn.addEventListener("click", function () {
        elAvatarInput.click();
      });
      elAvatarInput.addEventListener("change", function () {
        var f = elAvatarInput.files && elAvatarInput.files[0];
        if (!f || String(f.type).indexOf("image/") !== 0) {
          return;
        }
        if (f.size > 600 * 1024) {
          window.alert("图片请小于约 600KB。");
          return;
        }
        var rd = new FileReader();
        rd.onload = function () {
          var p = loadSettingsProfile();
          p.avatarDataUrl = rd.result;
          saveSettingsProfile(p);
          if (elAvatarImg) {
            elAvatarImg.src = p.avatarDataUrl;
          }
          if (typeof window.__profileCloudPush === "function") {
            window.__profileCloudPush(p).finally(function () {
              if (typeof window.__butterflyAuthSync === "function") {
                window.__butterflyAuthSync();
              }
            });
          } else if (typeof window.__butterflyAuthSync === "function") {
            window.__butterflyAuthSync();
          }
        };
        rd.readAsDataURL(f);
      });
    }

    var polLink = document.getElementById("settings-policy-placeholder");
    if (polLink) {
      polLink.addEventListener("click", function (e) {
        e.preventDefault();
      });
    }

    if (elSave) {
      elSave.addEventListener("click", function () {
        var nick = elNickname ? elNickname.value.trim() : "";
        var bioV = elBio ? elBio.value.trim() : "";
        if (!nick || !bioV) {
          window.alert("请填写昵称与个性签名（均为必填）。");
          return;
        }
        var p = loadSettingsProfile();
        p.nickname = nick;
        p.bio = bioV;
        delete p.username;
        saveSettingsProfile(p);
        function showProfileToast(r) {
          if (elToast) {
            if (r && r.ok) {
              elToast.textContent = "已保存到本机与云端";
            } else if (r && r.skipped) {
              elToast.textContent = "已保存到本机浏览器（登录账号后可同步云端）";
            } else {
              elToast.textContent = "已保存到本机，云端同步失败，可稍后再试";
            }
            elToast.removeAttribute("hidden");
            window.setTimeout(function () {
              elToast.setAttribute("hidden", "");
            }, 2600);
          }
        }
        function afterPush(r) {
          if (typeof window.__butterflyAuthSync === "function") {
            window.__butterflyAuthSync();
          }
          render();
          showProfileToast(r);
        }
        if (typeof window.__profileCloudPush === "function") {
          window.__profileCloudPush(p).then(afterPush).catch(function () {
            afterPush({ ok: false });
          });
        } else {
          afterPush({ skipped: true });
        }
      });
    }
  }

  window.__onSkillsCloudCacheUpdated = function () {
    render();
  };

  initSettingsOverlay();
  initUserMenu();
})();
