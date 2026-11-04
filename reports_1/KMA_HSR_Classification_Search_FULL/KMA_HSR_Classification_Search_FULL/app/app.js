/* KMA HSR 강수 유형 분류 및 유사 사례 검색 — 오프라인(file://) 정적 앱.
   데이터: data/index.js(VB_INDEX), data/golden.js(VB_GOLDEN), data/stats.js(VB_STATS), data/m/YYYYMM.js(VB_LOAD, 월별 상세, 필요할 때 <script>로 로드).
   영상: img/q/YYYYMM/<frame_id>.webp(질의), img/g/<golden_frame_id>.webp(GOLDEN 참조). fetch를 사용하지 않음. */
(function () {
  "use strict";
  var IDX = window.VB_INDEX, GOLD = window.VB_GOLDEN, ST = window.VB_STATS;
  var C = {}; IDX.cols.forEach(function (c, i) { C[c] = i; });
  var ROWS = IDX.rows;
  var IS_DEMO = IDX.mode === "DEMO";
  var byId = new Map(); ROWS.forEach(function (r, i) { byId.set(r[C.f], i); });
  var ALL_IDS = IS_DEMO ? IDX.all_ids : ROWS.map(function (r) { return r[C.f]; });
  var allSet = new Set(ALL_IDS);
  var GN = ST.gname;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- 형식
  function ok(v) { return v !== null && v !== undefined && !(typeof v === "number" && !isFinite(v)); }
  function num(v, k) { if (!ok(v)) return "–"; return Number(v).toLocaleString("en-US", { minimumFractionDigits: k || 0, maximumFractionDigits: k || 0 }); }
  function pct(a, b) { if (!ok(a) || !b) return "–"; return (100 * a / b).toFixed(1) + "%"; }
  function esc(s) { return String(ok(s) ? s : "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ts(f) { return f.slice(0, 4) + "-" + f.slice(4, 6) + "-" + f.slice(6, 8) + " " + f.slice(8, 10) + ":" + f.slice(10, 12); }
  function cls(b) { return b ? "TY" : "LINEAR"; }
  function pill(c) { return '<span class="pill ' + c + '">' + c + "</span>"; }
  var GCOL = { A: "var(--A)", B: "var(--B)", C: "var(--C)", D: "var(--D)" };

  // ---------- 월별 데이터 로드(<script> 주입; file:// 호환)
  var cache = {}, waiting = {};
  window.VB_LOAD = function (o) { cache[o.ym] = o.rec; (waiting[o.ym] || []).forEach(function (f) { f.ok(); }); delete waiting[o.ym]; };
  function loadMonth(ym) {
    return new Promise(function (res, rej) {
      if (cache[ym]) return res(cache[ym]);
      var w = { ok: function () { res(cache[ym]); }, err: rej };
      if (waiting[ym]) { waiting[ym].push(w); return; }
      waiting[ym] = [w];
      var s = document.createElement("script");
      s.src = "data/m/" + ym + ".js";
      s.onerror = function () { var ws = waiting[ym] || []; delete waiting[ym]; ws.forEach(function (x) { x.err(new Error(ym)); }); };
      document.head.appendChild(s);
    });
  }
  function qsrc(f) { return "img/q/" + f.slice(0, 6) + "/" + f + ".webp"; }
  function gsrc(g) { return "img/g/" + g + ".webp"; }

  // ---------- 모드
  $("modeBadge").textContent = IS_DEMO ? "데모판 · " + num(IDX.n) + " / " + num(IDX.n_all) + " 프레임" : "전체판 · " + num(IDX.n) + " 프레임";
  if (IS_DEMO) {
    $("modeBadge").classList.add("demo");
    document.body.classList.add("demo");
    var b = $("demoBanner"); b.hidden = false;
    b.textContent = "데모판입니다. 전체 12,631개 후보 프레임 중 대표 사례 " + num(IDX.n) + "개 프레임만 레이더 영상·Top-5와 함께 포함되어 있습니다. 나머지 프레임은 전체판(FULL)에서 확인하십시오. 통계 탭은 전체 12,631 프레임 기준입니다.";
  }

  // ---------- 탭
  var tabs = document.querySelectorAll(".tabs button");
  function showTab(t) {
    tabs.forEach(function (b) { b.classList.toggle("on", b.dataset.tab === t); b.setAttribute("aria-selected", b.dataset.tab === t); });
    ["search", "stats", "about"].forEach(function (x) { $("tab-" + x).hidden = x !== t; });
    if (t === "search") renderList();
  }
  tabs.forEach(function (b) { b.onclick = function () { showTab(b.dataset.tab); }; });

  // ---------- 필터
  var F = { date: "", d1: "", m0: "", ag: "", sea: "", q: "", g: "" };
  ST.a40q.forEach(function (q) { var o = document.createElement("option"); o.value = q.q; o.textContent = "Q" + q.q + " (" + num(q.lo) + "–" + num(q.hi) + " km²)"; $("fA40").appendChild(o); });
  var gb = $("grpBtns");
  ["A", "B", "C", "D"].forEach(function (g) {
    var bt = document.createElement("button"); bt.type = "button"; bt.dataset.g = g; bt.textContent = g;
    bt.title = GN[g] + " (" + num(ST.groups[g]) + " 프레임, 전체 기준)";
    bt.onclick = function () { F.g = F.g === g ? "" : g; syncGroupBtns(); apply(true); };
    gb.appendChild(bt);
  });
  var cq = document.createElement("button"); cq.type = "button"; cq.id = "cQuick"; cq.textContent = "C 그룹 바로 보기";
  cq.title = "DINOv3=LINEAR, M0=TY (" + num(ST.groups.C) + " 프레임) — 현재 중점 연구 대상";
  cq.onclick = function () { resetFilters(); F.g = "C"; syncGroupBtns(); apply(true); };
  gb.appendChild(cq);
  function syncGroupBtns() { gb.querySelectorAll("button[data-g]").forEach(function (b) { var on = b.dataset.g === F.g; b.classList.toggle("on", on); b.style.background = on ? GCOL[b.dataset.g] : ""; }); }
  [["fDate", "date"], ["fD1", "d1"], ["fM0", "m0"], ["fAg", "ag"], ["fSea", "sea"], ["fA40", "q"]].forEach(function (p) {
    $(p[0]).addEventListener("change", function () { F[p[1]] = $(p[0]).value; apply(true); });
  });
  function resetFilters() { F = { date: "", d1: "", m0: "", ag: "", sea: "", q: "", g: "" }; ["fDate", "fD1", "fM0", "fAg", "fSea", "fA40"].forEach(function (i) { $(i).value = ""; }); syncGroupBtns(); }
  $("fReset").onclick = function () { resetFilters(); hideMsg(); apply(true); };

  var list = [];  // ROWS 인덱스
  function pass(r) {
    if (F.date && r[C.f].slice(0, 8) !== F.date.replace(/-/g, "")) return false;
    if (F.d1 !== "" && String(r[C.d1]) !== F.d1) return false;
    if (F.m0 !== "" && String(r[C.m0]) !== F.m0) return false;
    if (F.ag !== "" && String(+(r[C.d1] === r[C.m0])) !== F.ag) return false;
    if (F.sea) { var m = r[C.mon], warm = m >= 6 && m <= 10; if ((F.sea === "warm") !== warm) return false; }
    if (F.q && String(r[C.q]) !== F.q) return false;
    if (F.g && r[C.g] !== F.g) return false;
    return true;
  }
  function apply(selectFirst) {
    list = [];
    for (var i = 0; i < ROWS.length; i++) if (pass(ROWS[i])) list.push(i);
    $("count").innerHTML = "검색 결과 <b>" + num(list.length) + "</b> / " + num(ROWS.length) + " 프레임";
    $("vlist").scrollTop = 0;
    renderList();
    if (!list.length) { showEmpty(); return; }
    if (selectFirst && list.indexOf(sel) < 0) select(list[0]);
    else updatePos();
  }

  // ---------- 가상 목록
  var RH = 44, sel = -1;
  var vl = $("vlist"), vs = $("vspace");
  function renderList() {
    vs.style.height = list.length * RH + "px";
    var top = vl.scrollTop, h = vl.clientHeight || 600;
    var a = Math.max(0, Math.floor(top / RH) - 8), b = Math.min(list.length, Math.ceil((top + h) / RH) + 8);
    var html = "";
    for (var k = a; k < b; k++) {
      var r = ROWS[list[k]];
      html += '<div class="row' + (list[k] === sel ? " sel" : "") + '" data-i="' + list[k] + '" style="top:' + k * RH + 'px">' +
        '<span class="dot" style="background:' + GCOL[r[C.g]] + '"></span><span class="t">' + ts(r[C.f]) + '</span>' +
        '<span class="s">DINOv3 ' + cls(r[C.d1]) + " · M0 " + cls(r[C.m0]) + (r[C.d1] !== r[C.m0] ? " · 불일치" : "") + "</span></div>";
    }
    vs.innerHTML = html;
  }
  vl.addEventListener("scroll", function () { window.requestAnimationFrame(renderList); });
  vs.addEventListener("click", function (e) { var d = e.target.closest(".row"); if (d) select(+d.dataset.i); });
  function ensureVisible() {
    var k = list.indexOf(sel); if (k < 0) return;
    var y = k * RH; if (y < vl.scrollTop || y > vl.scrollTop + vl.clientHeight - RH) vl.scrollTop = Math.max(0, y - vl.clientHeight / 2);
  }
  function updatePos() {
    var k = list.indexOf(sel);
    $("pos").textContent = k >= 0 ? (k + 1) + " / " + num(list.length) : "목록 밖";
    $("prev").disabled = k <= 0; $("next").disabled = k < 0 || k >= list.length - 1;
  }
  function step(d) { var k = list.indexOf(sel); if (k < 0) { if (list.length) select(list[0]); return; } var n = k + d; if (n >= 0 && n < list.length) select(list[n]); }
  $("prev").onclick = function () { step(-1); };
  $("next").onclick = function () { step(1); };

  // ---------- 시각 검색
  function showMsg(h) { var m = $("msg"); m.innerHTML = h; m.hidden = false; }
  function hideMsg() { $("msg").hidden = true; }
  function nearest(f) {
    var lo = 0, hi = ALL_IDS.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (ALL_IDS[mid] < f) lo = mid + 1; else hi = mid; }
    return [ALL_IDS[lo - 1], ALL_IDS[lo]];
  }
  $("fTimeForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var raw = $("fTime").value.trim(), d = raw.replace(/\D/g, "");
    if (!d) { showMsg("YYYYMMDDHHMM 형식(예: 202008021630)으로 입력하십시오."); return; }
    if (d.length === 8) { resetFilters(); F.date = d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8); $("fDate").value = F.date; hideMsg(); apply(true);
      if (!list.length) showMsg(esc(F.date) + " 날짜에 포함된 프레임이 없습니다."); return; }
    if (d.length !== 12) { showMsg("시각은 12자리(YYYYMMDDHHMM), 날짜는 8자리(YYYYMMDD)로 입력하십시오. 입력값: " + esc(raw)); return; }
    goto(d);
  });
  function goto(f) {
    if (byId.has(f)) {
      var i = byId.get(f);
      if (!pass(ROWS[i])) { resetFilters(); apply(false); showMsg("필터를 초기화하고 " + ts(f) + " 프레임으로 이동했습니다."); } else hideMsg();
      select(i); return;
    }
    var nb = nearest(f), h = "";
    if (IS_DEMO && allSet.has(f)) h = ts(f) + " 프레임은 12,631개 후보에 있지만 <b>데모판에는 포함되어 있지 않습니다</b>. 전체판(FULL)에서 확인하십시오.";
    else h = ts(f) + " 시각은 12,631개 후보 프레임에 없습니다(사후 선별 조건을 만족하지 않았거나 GOLDEN 프레임 또는 자료 없음).";
    var btn = function (x) { return x ? ' <button type="button" data-go="' + x + '">' + ts(x) + "</button>" : ""; };
    var nbd = nb.filter(function (x) { return x && byId.has(x); });
    if (!IS_DEMO) h += " 가장 가까운 후보:" + btn(nb[0]) + btn(nb[1]);
    else if (nbd.length) h += " 데모판의 가까운 프레임:" + nbd.map(btn).join("");
    showMsg(h);
  }
  $("msg").addEventListener("click", function (e) { var b = e.target.closest("button[data-go]"); if (b) goto(b.dataset.go); });

  // ---------- 선택 프레임 표시
  var token = 0, curRec = null, curF = null;
  function showEmpty() {
    sel = -1; updatePos();
    $("info").innerHTML = '<div class="empty">조건에 맞는 프레임이 없습니다. 필터를 조정하십시오.</div>';
    $("cards").innerHTML = ""; $("qImg").removeAttribute("src"); $("qCap").textContent = ""; $("qMiss").hidden = true;
  }
  function select(i) {
    sel = i; var r = ROWS[i], f = r[C.f], my = ++token;
    curF = f; curRec = null;
    renderList(); ensureVisible(); updatePos();
    var img = $("qImg"); $("qMiss").hidden = true;
    img.onerror = function () { if (my === token) $("qMiss").hidden = false; };
    img.src = qsrc(f);
    $("qCap").textContent = "HSR 합성 반사도 · " + ts(f) + " KST · 빨간 선 = 장축이 가장 긴 주 객체, 회색 = 관측 범위 밖";
    renderInfo(r, null);
    $("cards").innerHTML = '<div class="empty">불러오는 중…</div>';
    loadMonth(f.slice(0, 6)).then(function (rec) {
      if (my !== token) return;
      curRec = rec[f]; renderInfo(r, curRec); renderCards(curRec);
      prefetch();
    }).catch(function () { if (my === token) $("cards").innerHTML = '<div class="empty">상세 자료를 불러오지 못했습니다(data/m 폴더 확인).</div>'; });
  }
  function prefetch() {
    var k = list.indexOf(sel); if (k < 0 || k + 1 >= list.length) return;
    var nf = ROWS[list[k + 1]][C.f];
    loadMonth(nf.slice(0, 6)).catch(function () {});
    (new Image()).src = qsrc(nf);
  }
  function pbar(p) { return '<div class="pbar"><s></s><i style="left:calc(' + (100 * p).toFixed(2) + '% - 1px)"></i></div>'; }
  function renderInfo(r, d) {
    var d1 = cls(r[C.d1]), m0 = cls(r[C.m0]), agree = r[C.d1] === r[C.m0], g = r[C.g];
    var h = '<div class="qtitle"><span class="dt">' + ts(r[C.f]) + ' KST</span><span class="ep">' + (d ? "기상 과정 " + esc(d.ep) : "") + "</span></div>";
    h += '<div class="models">' +
      '<div class="mcard"><div class="mn">DINOv3 + LR (영상 기반)</div><div class="lab">' + pill(d1) + "</div>" + pbar(r[C.p1]) +
      '<div class="ptxt">P(TY) = ' + num(r[C.p1], 3) + (d && d.lc1 ? " · 임계값 근처(저신뢰)" : "") + "</div></div>" +
      '<div class="mcard"><div class="mn">M0 (7개 기상 특징 LR)</div><div class="lab">' + pill(m0) + "</div>" + pbar(r[C.p0]) +
      '<div class="ptxt">P(TY) = ' + num(r[C.p0], 3) + (d && d.lc0 ? " · 임계값 근처(저신뢰)" : "") + "</div></div></div>";
    h += '<div class="agree ' + (agree ? "y" : "n") + '">' + (agree ? "✓ 두 모델 일치" : "⚠ 두 모델 불일치") +
      '<span class="gtag">' + esc(GN[g]) + "</span></div>";
    h += '<div class="note">이 프레임에는 GOLDEN 정답 라벨이 없습니다. 모델 출력은 검증된 정답이 아니며, P(TY)는 정확도가 아니라 모델이 출력한 TY 확률입니다(0.5 이상 → TY).</div>';
    if (d) {
      var s = d.scr, m = d.met;
      h += '<div class="scr">사후 선별: ≥40 dBZ 객체·장축 ≥100 km <span class="ok">' + (s.p40 ? "충족" : "미충족") + "</span> · 3시간 이상 지속 <span class=\"ok\">" +
        (s.r3 ? "충족" : "미충족") + "</span>" + (s.run ? " · 이 프레임은 연속 3시간 구간 안" : " · 이 프레임은 연속 구간 " + ({ before_run: "이전", after_run: "이후", between_runs: "사이" }[s.side] || "밖")) +
        " (최장 연속 " + num(s.el) + "분)</div>";
      h += '<div class="kv">' +
        "<div><span>≥40 dBZ 강에코 면적</span><b>" + num(m.a40) + " km²</b></div>" +
        "<div><span>≥20 dBZ 에코 면적</span><b>" + num(m.a20) + " km²</b></div>" +
        "<div><span>주 객체 PCA 장축</span><b>" + num(m.mj) + " km</b></div>" +
        "<div><span>최대 반사도</span><b>" + num(m.mx, 1) + " dBZ</b></div>" +
        "<div><span>강에코 반사도 P90</span><b>" + num(m.p90, 1) + " dBZ</b></div>" +
        "<div><span>≥10 dBZ 강수 면적</span><b>" + num(m.a10) + " km²</b></div></div>";
      h += "<details><summary>선별·추적 상세</summary><table>" +
        "<tr><td>판정 방식</td><td>전체 과정 기록을 본 사후(retrospective) 판정 · 미래 정보 사용</td></tr>" +
        "<tr><td>대표 연속 구간</td><td>" + (s.rs && s.rs !== "nan" ? ts(s.rs) + " – " + ts(s.re) : "–") + "</td></tr>" +
        "<tr><td>그 시각까지의 자료만으로 3시간 확인</td><td>" + (s.asof ? "가능" : "불가(사후에만 확인)") + "</td></tr>" +
        "<tr><td>추적 연결</td><td>" + (s.rob === "ROBUST_TO_AMBIGUITY_BREAK" ? "모호한 연결을 끊어도 유지" : "모호한 연결에 민감") + "</td></tr>" +
        "<tr><td>후보 객체 수 · 최대 장축</td><td>" + num(s.nc) + "개 · " + num(s.mx, 1) + " km</td></tr>" +
        "<tr><td>관측 경계 접촉</td><td>후보 객체 " + (s.bnd ? "접촉" : "비접촉") + " · 주 객체 " + (m.tb ? "접촉" : "비접촉") + "</td></tr></table></details>";
      h += "<details><summary>추가 기상 지표</summary><table>" +
        "<tr><td>주 객체 직선성 · 종횡비</td><td>" + num(m.lin, 2) + " · " + num(m.asp, 2) + "</td></tr>" +
        "<tr><td>주요 객체 수(≥25 km²)</td><td>" + num(m.nmaj) + "</td></tr>" +
        "<tr><td>≥30 dBZ 에코 중심</td><td>" + num(m.lat, 2) + "°N, " + num(m.lon, 2) + "°E</td></tr></table></details>";
    } else h += '<div class="scr">상세 자료를 불러오는 중…</div>';
    $("info").innerHTML = h;
  }
  function renderCards(d) {
    var h = "";
    d.top.forEach(function (t, k) {
      var gm = GOLD[t[0]] || {};
      h += '<button type="button" class="card" data-k="' + k + '"><img loading="lazy" src="' + gsrc(t[0]) + '" alt="GOLDEN 참조 ' + t[1] + '위">' +
        '<span class="cm"><span class="rk">' + t[1] + "위 " + pill(gm.c || "–") + '</span><span class="ct">' + esc(gm.t) + '</span><span class="ct">과정 ' + esc(gm.p) +
        '</span><span class="sim">유사도 <b>' + num(t[2], 3) + "</b></span>" + (t[8] ? '<span class="badge fut" title="참조 사례가 현재 프레임보다 늦은 시각입니다(사후 검색).">사후 참조</span>' : "") +
        (t[9] ? '<span class="badge unc" title="현재 프레임과 7일 이내로 기상학적 독립성이 불확실합니다.">7일 이내</span>' : "") + "</span></button>";
    });
    $("cards").innerHTML = h;
    $("cards").querySelectorAll(".card").forEach(function (c) { c.onclick = function () { openCmp(+c.dataset.k); }; });
    fitCards();
  }
  function fitCards() {
    var t5 = document.querySelector(".t5"), w = $("cards").clientWidth;
    if (!w) return;
    var colw = (w - 40) / 5, ih = Math.max(110, Math.min(200, (colw - 96) * 522 / 422, window.innerHeight * 0.24));
    document.documentElement.style.setProperty("--cardimg", Math.round(ih) + "px");
  }
  window.addEventListener("resize", function () { fitCards(); renderList(); });

  // ---------- 비교 창
  var mk = 0;
  var GL = ["형태", "조직", "강도", "규모"], GCOLS = ["#2a78d6", "#1baf7a", "#6250d6", "#eb6834"];
  function openCmp(k) {
    if (!curRec) return;
    mk = k; var t = curRec.top[k], gm = GOLD[t[0]] || {}, r = ROWS[sel], qv = curRec.qv, gv = gm.v || [];
    $("mTitle").textContent = "두 영상 비교 · Top-" + t[1] + " / 5";
    var rows = [["≥40 dBZ 강에코 면적", 0, "km²", 0], ["≥20 dBZ 에코 면적", 1, "km²", 0], ["주 객체 장축", 2, "km", 0], ["강에코 반사도 P90", 3, "dBZ", 1], ["최대 반사도", 4, "dBZ", 1]];
    var tb = '<table class="dt"><tr><th>지표</th><th>현재 프레임</th><th>GOLDEN 사례</th><th>차이(사례−현재)</th></tr>' + rows.map(function (x) {
      var a = qv[x[1]], b = gv[x[1]], df = ok(a) && ok(b) ? b - a : null, rt = x[2] === "km²" && ok(a) && ok(b) && a > 0 ? " (×" + (b / a).toFixed(2) + ")" : "";
      return "<tr><td>" + x[0] + "</td><td>" + num(a, x[3]) + " " + x[2] + "</td><td>" + num(b, x[3]) + " " + x[2] + "</td><td>" + (ok(df) ? (df > 0 ? "+" : "") + num(df, x[3]) + rt : "–") + "</td></tr>";
    }).join("") + "</table>";
    var gb = t[4].map(function (dv, j) {
      var c = t[5][j];
      return '<div class="gbar"><span>' + GL[j] + ' 거리</span><span class="b"><i style="width:' + (ok(c) ? (100 * c).toFixed(1) : 0) + "%;background:" + GCOLS[j] + '"></i></span><span>' + num(dv, 3) + " · 기여 " + (ok(c) ? (100 * c).toFixed(0) + "%" : "–") + "</span></div>";
    }).join("");
    var chips = function (a, d) { return a && a.length ? a.map(function (x) { return '<span class="chip' + (d ? " d" : "") + '">' + esc(x) + "</span>"; }).join("") : '<span class="chip">–</span>'; };
    var h = '<div class="cmp"><figure><img src="' + qsrc(r[C.f]) + '" alt="현재 프레임"><figcaption><b>현재 프레임</b> · ' + ts(r[C.f]) + " KST · DINOv3 " + pill(cls(r[C.d1])) + " M0 " + pill(cls(r[C.m0])) +
      ' <span class="badge">정답 라벨 없음</span></figcaption></figure>' +
      '<figure><img src="' + gsrc(t[0]) + '" alt="GOLDEN 사례"><figcaption><b>GOLDEN 사례 ' + t[1] + "위</b> · " + esc(gm.t) + " KST · 과정 " + esc(gm.p) + " · 전문가 라벨 " + pill(gm.c || "–") +
      (t[8] ? ' <span class="badge fut">사후 참조</span>' : "") + "</figcaption></figure></div>";
    h += '<div class="diff"><div>' + tb + '<div class="note" style="margin-top:8px">GOLDEN 사례의 전문가 라벨은 현재(라벨 없는) 프레임의 정답이 아니며, 검색 결과는 모델 예측이 맞다는 독립적 증거가 아닙니다. ' +
      "검색은 사후(retrospective) 방식이라 현재 프레임보다 늦은 사례도 참조할 수 있으며, 이런 사례는 ‘사후 참조’로 표시합니다.</div></div>" +
      "<div><div><b>유사도 " + num(t[2], 3) + "</b> · 종합 거리 " + num(t[3], 3) + ' <span class="badge">유사도 = 1 / (1 + 거리), 4개 그룹 같은 가중치</span></div>' + gb +
      "<div style=\"margin-top:6px\">가장 비슷한 특징</div><div class=\"chips\">" + chips(t[6], false) + "</div>" +
      "<div>가장 다른 특징</div><div class=\"chips\">" + chips(t[7], true) + "</div>" +
      "<details><summary>세부 정보</summary><table>" +
      "<tr><td>GOLDEN 원 라벨</td><td>" + esc(gm.o) + "</td></tr>" +
      "<tr><td>과정 대응 방식</td><td>" + (t[10] ? "기상 과정 번호로 동일 과정 제외" : "과정 대응 자료 없음 · 48시간 창으로만 제외") + "</td></tr>" +
      "<tr><td>시간 간격</td><td>" + (t[9] ? "현재 프레임과 7일 이내(독립성 불확실)" : "7일 이상") + "</td></tr>" +
      "<tr><td>거리 해석</td><td>그룹 거리 = 표준화 특징 차이 제곱의 평균; 기여 = 종합 거리 중 그 그룹이 차지하는 비율</td></tr></table></details></div></div>";
    $("mBody").innerHTML = h;
    $("mPrev").disabled = k === 0; $("mNext").disabled = k === curRec.top.length - 1;
    $("modal").hidden = false; $("mClose").focus();
  }
  function closeCmp() { $("modal").hidden = true; }
  $("mClose").onclick = closeCmp;
  $("mPrev").onclick = function () { if (mk > 0) openCmp(mk - 1); };
  $("mNext").onclick = function () { if (curRec && mk < curRec.top.length - 1) openCmp(mk + 1); };
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeCmp(); });
  document.addEventListener("keydown", function (e) {
    if (!$("modal").hidden) { if (e.key === "Escape") closeCmp(); if (e.key === "ArrowLeft") $("mPrev").click(); if (e.key === "ArrowRight") $("mNext").click(); return; }
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea" || $("tab-search").hidden) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); step(1); }
  });

  // ---------- 통계
  function bars(data, opt) {
    // data: [{x, a, b, n, hl}] — a/b 비율(0–1)
    var W = 640, H = 210, L = 34, B = 34, T = 10, n = data.length, bw = (W - L - 10) / n;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opt.title) + '">';
    [0, .25, .5, .75, 1].forEach(function (y) { var yy = T + (H - T - B) * (1 - y); s += '<line x1="' + L + '" x2="' + (W - 6) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e6e5e0"/><text x="' + (L - 4) + '" y="' + (yy + 4) + '" font-size="10" text-anchor="end" fill="#8a8984">' + (y * 100) + "%</text>"; });
    data.forEach(function (d, i) {
      var x0 = L + i * bw;
      if (d.hl) s += '<rect x="' + x0 + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '" fill="#eef3fb"/>';
      [["a", opt.ca], ["b", opt.cb]].forEach(function (p, j) {
        var v = d[p[0]], hh = (H - T - B) * v, x = x0 + bw * (0.16 + j * 0.35), w = bw * 0.3;
        s += '<rect x="' + x.toFixed(1) + '" y="' + (T + (H - T - B) - hh).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(hh, 0).toFixed(1) + '" rx="2" fill="' + p[1] + '"><title>' +
          esc(d.x + " · " + (j ? opt.lb : opt.la) + " " + (100 * v).toFixed(1) + "% (n=" + num(d.n) + ")") + "</title></rect>";
      });
      s += '<text x="' + (x0 + bw / 2) + '" y="' + (H - B + 13) + '" font-size="10.5" text-anchor="middle" fill="#52514e">' + esc(d.x) + "</text>" +
        '<text x="' + (x0 + bw / 2) + '" y="' + (H - B + 26) + '" font-size="9.5" text-anchor="middle" fill="#8a8984">' + num(d.n) + "</text>";
    });
    return s + "</svg>";
  }
  function renderStats() {
    var n = ST.n, G = ST.groups;
    var h = '<div class="note">' + (IS_DEMO ? "통계는 전체 12,631 프레임 기준입니다(데모판 목록은 그중 " + num(IDX.n) + " 프레임). " : "") +
      "통계는 원 결과 CSV에서 다시 계산한 값입니다. 라벨이 없으므로 정확도는 계산하지 않습니다.</div>";
    h += '<div class="tiles"><div class="tile"><div class="k">후보 프레임</div><div class="v">' + num(n) + '</div><div class="s">사후 선별 · 비 GOLDEN</div></div>' +
      '<div class="tile"><div class="k">DINOv3</div><div class="v">' + pill("LINEAR") + " " + num(ST.d1.LINEAR) + '</div><div class="s">' + pill("TY") + " " + num(ST.d1.TY) + " (" + pct(ST.d1.TY, n) + ")</div></div>" +
      '<div class="tile"><div class="k">M0</div><div class="v">' + pill("LINEAR") + " " + num(ST.m0.LINEAR) + '</div><div class="s">' + pill("TY") + " " + num(ST.m0.TY) + " (" + pct(ST.m0.TY, n) + ")</div></div>" +
      '<div class="tile"><div class="k">두 모델 일치율</div><div class="v">' + pct(ST.agree, n) + '</div><div class="s">일치 ' + num(ST.agree) + " · 불일치 " + num(n - ST.agree) + "</div></div></div>";
    h += '<div class="sbox"><h2>네 가지 조합</h2><div class="gcards">' + ["A", "B", "C", "D"].map(function (g) {
      return '<div class="gcard' + (g === "C" ? " focus" : "") + '" style="border-top-color:' + GCOL[g] + '"><div class="k">' + esc(GN[g]) + '</div><div class="v">' + num(G[g]) + "</div><div class=\"s\">" + pct(G[g], n) +
        (g === "C" ? " · <b>현재 중점 연구 대상</b>" : "") + '</div><button type="button" data-goto="' + g + '">목록 보기</button></div>';
    }).join("") + "</div></div>";
    var mon = ST.months.map(function (m) { return { x: m.m + "월", a: m.d1 / m.n, b: m.m0 / m.n, n: m.n, hl: m.m >= 6 && m.m <= 10 }; });
    var aq = ST.a40q.map(function (q) { return { x: "Q" + q.q, a: q.d1 / q.n, b: q.m0 / q.n, n: q.n }; });
    var lg = '<div class="legend"><span><i style="background:#6250d6"></i>DINOv3가 TY로 판단한 비율</span><span><i style="background:#1baf7a"></i>M0가 TY로 판단한 비율</span></div>';
    h += '<div class="two"><div class="sbox chart"><h2>월별 TY 판단 비율</h2>' + lg + bars(mon, { title: "월별 TY 비율", ca: "#6250d6", cb: "#1baf7a", la: "DINOv3 TY", lb: "M0 TY" }) +
      '<div class="s" style="font-size:12px;color:var(--ink2)">음영 = 6–10월(GOLDEN LINEAR/TY 학습 라벨이 있는 달). 11–5월은 두 모델의 학습 계절 밖입니다. 숫자 = 프레임 수.</div></div>' +
      '<div class="sbox chart"><h2>강에코(≥40 dBZ) 면적 5분위별 TY 판단 비율</h2>' + lg + bars(aq, { title: "면적별 TY 비율", ca: "#6250d6", cb: "#1baf7a", la: "DINOv3 TY", lb: "M0 TY" }) +
      '<div class="s" style="font-size:12px;color:var(--ink2)">' + ST.a40q.map(function (q) { return "Q" + q.q + " ≤ " + num(q.hi) + " km²"; }).join(" · ") + "</div></div></div>";
    h += '<div class="sbox"><h2>계절별 비교</h2><div class="tiles">' + ST.season.map(function (s) {
      return '<div class="tile"><div class="k">' + esc(s.k) + " · " + num(s.n) + ' 프레임</div><div class="s">DINOv3 TY ' + pct(s.d1, s.n) + " · M0 TY " + pct(s.m0, s.n) + " · 일치 " + pct(s.ag, s.n) +
        "</div><div class=\"s\">C 그룹 " + num(s.C) + " · D 그룹 " + num(s.D) + '</div><button type="button" data-sea="' + (s.k.indexOf("6") === 0 ? "warm" : "cold") + '">이 계절의 불일치 사례 보기</button></div>';
    }).join("") + "</div></div>";
    h += '<div class="sbox"><h2>모델 불일치 사례 목록</h2><p style="margin:0 0 6px">불일치 ' + num(n - ST.agree) + " 프레임 = C " + num(G.C) + " + D " + num(G.D) + '.</p>' +
      '<button type="button" data-dis="all">불일치 전체 보기</button> <button type="button" data-goto="C">C: DINOv3 LINEAR / M0 TY</button> <button type="button" data-goto="D">D: DINOv3 TY / M0 LINEAR</button></div>';
    h += '<div class="sbox"><h2>Top-1 GOLDEN 사례 범주(참고)</h2><p style="margin:0">LINEAR ' + num(ST.top1.LINEAR) + " · TY " + num(ST.top1.TY) + " · NO_MCS " + num(ST.top1.NO_MCS) +
      ". Top-5 " + num(ST.top5_rows) + "건 중 ‘사후 참조’ " + num(ST.future_rows) + "건. 참조 범주는 현재 프레임의 정답이 아닙니다.</p></div>";
    $("stats").innerHTML = h;
    $("stats").querySelectorAll("button[data-goto]").forEach(function (b) { b.onclick = function () { resetFilters(); F.g = b.dataset.goto; syncGroupBtns(); showTab("search"); apply(true); }; });
    $("stats").querySelectorAll("button[data-sea]").forEach(function (b) { b.onclick = function () { resetFilters(); F.sea = b.dataset.sea; F.ag = "0"; $("fSea").value = F.sea; $("fAg").value = "0"; showTab("search"); apply(true); }; });
    $("stats").querySelectorAll("button[data-dis]").forEach(function (b) { b.onclick = function () { resetFilters(); F.ag = "0"; $("fAg").value = "0"; showTab("search"); apply(true); }; });
  }
  function renderAbout() {
    $("about").innerHTML = '<div class="sbox about"><h2>이 도구에 대하여</h2><ul>' +
      "<li>대상: 비 GOLDEN HSR 프레임 중 사후 선별(≥40 dBZ 객체, PCA 장축 ≥100 km, 3시간 이상 지속, 전체 과정 기록 사용)을 통과한 12,631 프레임.</li>" +
      "<li>분류: 기존에 학습·동결된 DINOv3+LR과 M0의 기존 출력값을 그대로 표시합니다(재학습·재추론 없음). 임계값 P(TY) ≥ 0.5 → TY.</li>" +
      "<li><b>이 12,631 프레임에는 GOLDEN 정답 라벨이 없습니다.</b> 모델 출력은 검증된 정답이 아니며, P(TY)는 정확도가 아닙니다.</li>" +
      "<li>유사 사례: PHASE9 R3_BALANCED(형태·조직·강도·규모 4개 그룹 같은 가중치) 기존 Top-5 결과. 같은 기상 과정과 48시간 이내 과정은 제외되며, 한 과정에서 최대 1개 사례만 선택됩니다.</li>" +
      "<li>검색은 사후 방식이므로 현재 프레임보다 늦은 GOLDEN 사례도 나올 수 있습니다(‘사후 참조’ 표시). 실시간 운영 조건과 다릅니다.</li>" +
      "<li>GOLDEN 사례의 전문가 라벨은 현재 프레임의 정답이 아니며, 검색 결과는 모델 예측이 맞다는 독립적 증거가 아닙니다. 검색 특징(면적·강도)은 M0 입력 특징과 겹칩니다.</li>" +
      "<li>모든 레이더 영상은 HSR 원자료를 같은 색표·같은 지도 범위로 다시 그린 실제 관측 영상입니다(0–70 dBZ, 5 dBZ 간격). 빨간 선 = 장축이 가장 긴 주 객체, 검은 선 = 그 밖의 ≥25 km² 객체, 회색 = 관측 범위 밖.</li>" +
      "<li>참고 분석: 두 모델의 불일치는 ≥20 dBZ 강수역이 넓고 강에코가 약한 프레임과 11–5월(학습 라벨이 없는 계절)에 집중됩니다. 자세한 내용은 분석 보고서를 참조하십시오.</li>" +
      "<li>키보드: ← / → 이전·다음 프레임, 비교 창에서 ← / → 다른 순위, Esc 닫기.</li></ul></div>" +
      '<div class="sbox"><h2>반사도 색표</h2>' + legendSvg() + "</div>";
  }
  function legendSvg() {
    var cols = ["#d9f2ff", "#9fd9fb", "#4fb3f0", "#1f78d1", "#2fbf4a", "#1d8f34", "#0b6122", "#ffe100", "#ffaa00", "#ff6a00", "#e8000b", "#a3000a", "#ff4fd8", "#9b2fd6"];
    var s = '<svg viewBox="0 0 470 40" style="max-width:470px">';
    cols.forEach(function (c, i) { s += '<rect x="' + (5 + i * 32) + '" y="4" width="32" height="14" fill="' + c + '" stroke="#ccc" stroke-width=".5"/>'; });
    for (var i = 0; i <= 14; i += 2) s += '<text x="' + (5 + i * 32) + '" y="32" font-size="10" text-anchor="middle" fill="#52514e">' + i * 5 + "</text>";
    return s + '<text x="465" y="32" font-size="10" text-anchor="end" fill="#52514e">dBZ</text></svg>';
  }

  // ---------- 시작
  renderStats(); renderAbout(); syncGroupBtns();
  apply(true);
  window.VB_APP = { select: select, goto: goto, apply: apply, F: function () { return F; }, list: function () { return list; }, sel: function () { return sel; }, token: function () { return token; }, cur: function () { return curF; }, rec: function () { return curRec; } };
})();
