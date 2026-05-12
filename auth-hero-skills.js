/**
 * login.html 左侧：一粟 Logo 背景 + 技能商店同源列表的「云」浮动装饰（无交互）
 * 仅展示与主站「技能商店」合并规则一致的本机 + 云端技能，不展示商店外的占位条目。
 */
(function () {
  var STORAGE_KEY = "agent_urls_v1";
  var MAX_IMAGE_DATA_URL = 2200000;

  /** 每圈最多 3 个、共 9 个，角间距约 120°，避免头像与标题互相叠压（与 login.html 椭圆一致） */
  var HERO_SKILL_CAP = 9;

  /** 与 login.html 中 `<ellipse>` 一致（viewBox 400，圆心 200,200） */
  var HERO_ORBIT_RINGS = [
    { rx: 190, ry: 156, rotDeg: -6 },
    { rx: 146, ry: 118, rotDeg: 14 },
    { rx: 106, ry: 86, rotDeg: -18 }
  ];

  /** viewBox 内椭圆上一点（与 `<ellipse>` + rotate 一致） */
  function heroEllipseViewBox(ring, t) {
    var ex = ring.rx * Math.cos(t);
    var ey = ring.ry * Math.sin(t);
    var rad = (ring.rotDeg * Math.PI) / 180;
    var cosR = Math.cos(rad);
    var sinR = Math.sin(rad);
    var dx = ex * cosR - ey * sinR;
    var dy = ex * sinR + ey * cosR;
    return { xSvg: 200 + dx, ySvg: 200 + dy };
  }

  /**
   * viewBox(0–400) → 技能云 left/top 百分比：与轨道 SVG（preserveAspectRatio meet）同一尺度，
   * 以云容器中心为 (200,200)，L 取云容器 min(宽,高)，与轨道层同盒（inset:0）对齐；不用 getBoundingClientRect，避免旋转时 AABB 偏差。
   */
  function heroViewBoxToCloudPercent(xSvg, ySvg, cloudEl) {
    var Wc = cloudEl.clientWidth || cloudEl.offsetWidth;
    var Hc = cloudEl.clientHeight || cloudEl.offsetHeight;
    if (!Wc || !Hc) {
      return { x: (xSvg / 400) * 100, y: (ySvg / 400) * 100 };
    }
    var L = Math.min(Wc, Hc);
    var xPx = Wc / 2 + ((xSvg - 200) / 400) * L;
    var yPx = Hc / 2 + ((ySvg - 200) / 400) * L;
    return { x: (xPx / Wc) * 100, y: (yPx / Hc) * 100 };
  }

  /** 每条轨道线上均分极角；人数均分到外/中/内三条椭圆（与 SVG 顺序一致） */
  function buildOrbitLayout(total) {
    var out = [];
    var n = Math.max(0, Math.min(total, HERO_SKILL_CAP));
    if (n === 0) {
      return out;
    }
    var a = Math.floor(n / 3);
    var rem = n % 3;
    var counts = [a + (rem > 0 ? 1 : 0), a + (rem > 1 ? 1 : 0), a];
    var ringIdx;
    for (ringIdx = 0; ringIdx < 3; ringIdx += 1) {
      var c = counts[ringIdx];
      var j;
      for (j = 0; j < c; j += 1) {
        var t = -Math.PI / 2 + (2 * Math.PI * j) / Math.max(c, 1);
        if (ringIdx === 1) {
          t += Math.PI / Math.max(c * 2, 2);
        } else if (ringIdx === 2) {
          t += Math.PI / Math.max(c * 4, 4);
        }
        var vb = heroEllipseViewBox(HERO_ORBIT_RINGS[ringIdx], t);
        out.push({ xSvg: vb.xSvg, ySvg: vb.ySvg });
      }
    }
    return out;
  }

  function hueFromId(id) {
    if (!id) {
      return 0;
    }
    var h = 0;
    var sid = String(id);
    for (var k = 0; k < sid.length; k += 1) {
      h = (h * 33 + sid.charCodeAt(k)) % 360;
    }
    return h;
  }

  function firstAvatarChar(titleText) {
    var t = titleText == null ? "" : String(titleText).trim();
    if (t.length === 0) {
      return "·";
    }
    return t.charAt(0);
  }

  function titleOf(it) {
    if (it.name && String(it.name).trim().length) {
      return String(it.name).trim();
    }
    if (it.url && String(it.url).trim().length) {
      return String(it.url).trim();
    }
    return "未命名";
  }

  function canUseImage(it) {
    return (
      it &&
      it.cardImageDataUrl &&
      typeof it.cardImageDataUrl === "string" &&
      it.cardImageDataUrl.indexOf("data:image/") === 0 &&
      it.cardImageDataUrl.length <= MAX_IMAGE_DATA_URL
    );
  }

  function loadLocalSkills() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * 与 app.js mergeStoreWithCloud(localFiltered) 在 cloudPasses 为 null 时一致：
   * 本机全部条目在前，再追加 id 未在本机出现的云端行。
   */
  function mergeStoreSkillsForHero() {
    var local = loadLocalSkills();
    var cloud = window.__skillsCloudCache || [];
    var seen = {};
    var out = [];
    var i;
    for (i = 0; i < local.length; i += 1) {
      var a = local[i];
      if (!a || a.id == null || String(a.id) === "") {
        continue;
      }
      var id = String(a.id);
      if (seen[id]) {
        continue;
      }
      seen[id] = true;
      out.push(a);
    }
    for (i = 0; i < cloud.length; i += 1) {
      var b = cloud[i];
      if (!b || b.id == null || String(b.id) === "") {
        continue;
      }
      var bid = String(b.id);
      if (seen[bid]) {
        continue;
      }
      seen[bid] = true;
      out.push(b);
    }
    return out;
  }

  function shuffleInPlace(arr) {
    var i = arr.length;
    while (i > 1) {
      i -= 1;
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function pickSkillsForHero() {
    var merged = mergeStoreSkillsForHero();
    shuffleInPlace(merged);
    return merged.slice(0, HERO_SKILL_CAP);
  }

  function displayName(full) {
    var s = String(full);
    if (s.length > 10) {
      return s.slice(0, 9) + "…";
    }
    return s;
  }

  function appendThumb(parent, it) {
    var titleText = titleOf(it);
    var thumb = document.createElement("div");
    thumb.className = "auth-hero-float__thumb";
    if (canUseImage(it)) {
      thumb.className = "auth-hero-float__thumb auth-hero-float__thumb--img";
      var im = document.createElement("img");
      im.src = it.cardImageDataUrl;
      im.alt = "";
      im.loading = "lazy";
      im.decoding = "async";
      thumb.appendChild(im);
    } else {
      var h = hueFromId(it.id);
      thumb.style.background =
        "linear-gradient(150deg, hsl(" + h + ", 32%, 92%), hsl(" + (h + 20) + ", 28%, 86%))";
      var letter = document.createElement("span");
      letter.className = "auth-hero-float__letter";
      letter.textContent = firstAvatarChar(titleText);
      thumb.appendChild(letter);
    }
    parent.appendChild(thumb);
  }

  function render() {
    var root = document.getElementById("auth-hero-cloud");
    if (!root) {
      return;
    }
    root.textContent = "";
    var items = pickSkillsForHero();
    var layout = buildOrbitLayout(items.length);
    var li;
    for (li = 0; li < items.length && li < layout.length; li += 1) {
      var it = items[li];
      var pos = layout[li];
      var fullTitle = titleOf(it);

      var wrap = document.createElement("div");
      wrap.className = "auth-hero-float";
      var pct = heroViewBoxToCloudPercent(pos.xSvg, pos.ySvg, root);
      wrap.style.left = pct.x + "%";
      wrap.style.top = pct.y + "%";

      var pivot = document.createElement("div");
      pivot.className = "auth-hero-float__pivot";

      var gimbal = document.createElement("div");
      gimbal.className = "auth-hero-float__gimbal";

      var scale = document.createElement("div");
      scale.className = "auth-hero-float__scale";

      var bob = document.createElement("div");
      bob.className = "auth-hero-float__bob";
      appendThumb(bob, it);

      var nm = document.createElement("div");
      nm.className = "auth-hero-float__name";
      nm.title = fullTitle;
      nm.textContent = displayName(fullTitle);

      bob.appendChild(nm);
      scale.appendChild(bob);
      gimbal.appendChild(scale);
      pivot.appendChild(gimbal);
      wrap.appendChild(pivot);
      root.appendChild(wrap);
    }
  }

  function boot() {
    render();
  }

  window.__onSkillsCloudCacheUpdated = render;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
