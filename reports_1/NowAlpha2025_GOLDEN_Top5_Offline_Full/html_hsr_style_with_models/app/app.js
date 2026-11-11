/* NowAlpha2025 L/S 예측 · 모델 분류 · GOLDEN 유사 사례 — 오프라인(file://) 정적 앱. 기존 HSR 분류·Top-5 검색 페이지와 같은 화면 구성·조작.
   세 결과는 서로 독립: ① L/S = Phase 5 규칙 기반 객체 식별, ② DINOv3/M0 = 모델 장면 분류(기존 HSR 모델 동결 추론),
   ③ GOLDEN Top-5 = 32차원 R3_BALANCED 과거 유사 사례 검색(참조 범주 표시만 LINEAR = LINEAR+SEMI_LINEAR / TY로 합침).
   데이터: data/index.js(NG2_INDEX), data/golden.js(NG2_GOLDEN), data/stats.js(NG2_STATS), data/d/YYYYMMDD.js(NG2_LOAD, 발표일별 상세, 필요할 때 <script>로 로드).
   영상: img/q/YYYYMM/<query_id>.webp(NowAlpha 예측), img/g/<golden_frame_id>.webp(GOLDEN 참조). fetch를 사용하지 않음.
   모든 거리·유사도는 정식 결과(results/na25_golden_top5.parquet)에서 그대로 복사한 값이며, 이 페이지는 아무것도 다시 계산하지 않습니다. */
(function () {
  "use strict";
  var IDX = window.NG2_INDEX, GOLD = window.NG2_GOLDEN, ST = window.NG2_STATS;
  var C = {}; IDX.cols.forEach(function (c, i) { C[c] = i; });
  var ROWS = IDX.rows, FEAT = IDX.feat;
  var byId = new Map(); ROWS.forEach(function (r, i) { byId.set(r[C.q], i); });
  var INITS = []; (function () { var s = new Set(); ROWS.forEach(function (r) { s.add(r[C.init]); }); INITS = Array.from(s).sort(); })();
  var firstOfInit = new Map(); ROWS.forEach(function (r, i) { if (!firstOfInit.has(r[C.init])) firstOfInit.set(r[C.init], i); });
  var $ = function (id) { return document.getElementById(id); };

  // ---------- 형식
  function ok(v) { return v !== null && v !== undefined && !(typeof v === "number" && !isFinite(v)); }
  function num(v, k) { if (!ok(v)) return "–"; return Number(v).toLocaleString("en-US", { minimumFractionDigits: k || 0, maximumFractionDigits: k || 0 }); }
  function pct(a, b) { if (!ok(a) || !b) return "–"; return (100 * a / b).toFixed(1) + "%"; }
  function esc(s) { return String(ok(s) ? s : "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ts(f) { return f.slice(0, 4) + "-" + f.slice(4, 6) + "-" + f.slice(6, 8) + " " + f.slice(8, 10) + ":" + f.slice(10, 12); }
  function addMin(f, m) {  // YYYYMMDDHHMM + m분 (달력 계산만; 시간대 변환 없음)
    var d = new Date(Date.UTC(+f.slice(0, 4), +f.slice(4, 6) - 1, +f.slice(6, 8), +f.slice(8, 10), +f.slice(10, 12)) + m * 60000);
    var p = function (x) { return (x < 10 ? "0" : "") + x; };
    return d.getUTCFullYear() + "" + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes());
  }
  var CATS = ["LINEAR", "TY"], ORIG = ["LINEAR", "SEMI_LINEAR", "TY"], LSN = ["L only", "S only", "L+S"], LSCOL = ["var(--ls-L)", "var(--ls-S)", "var(--ls-LS)"];
  var CATCOL = { LINEAR: "#2a78d6", SEMI_LINEAR: "#1baf7a", TY: "#eb6834" };
  var MLAB = ["LINEAR", "TY", "불가"];
  function agreeOf(r) { return r[C.md1] < 2 && r[C.mm0] < 2 ? (r[C.md1] === r[C.mm0] ? 1 : 0) : -1; }
  function catOrig(gm) { return gm.co && gm.co !== gm.c ? ' <span class="orig">(원본: ' + esc(gm.co) + ")</span>" : ""; }
  function pill(c) { return '<span class="pill ' + c + '">' + c + "</span>"; }
  function lsPills(nL, nS) { return (nL ? '<span class="pill L">L ×' + nL + "</span> " : "") + (nS ? '<span class="pill S">S ×' + nS + "</span>" : ""); }

  // ---------- 발표일별 상세 로드(<script> 주입; file:// 호환)
  var cache = {}, waiting = {};
  window.NG2_LOAD = function (o) { cache[o.d] = o.rec; (waiting[o.d] || []).forEach(function (f) { f.ok(); }); delete waiting[o.d]; };
  function loadDay(d) {
    return new Promise(function (res, rej) {
      if (cache[d]) return res(cache[d]);
      var w = { ok: function () { res(cache[d]); }, err: rej };
      if (waiting[d]) { waiting[d].push(w); return; }
      waiting[d] = [w];
      var s = document.createElement("script");
      s.src = "data/d/" + d + ".js";
      s.onerror = function () { var ws = waiting[d] || []; delete waiting[d]; ws.forEach(function (x) { x.err(new Error(d)); }); };
      document.head.appendChild(s);
    });
  }
  function qsrc(q) { return "img/q/" + q.slice(0, 6) + "/" + q + ".webp"; }
  function gsrc(g) { return "img/g/" + g + ".webp"; }

  // ---------- 모드
  $("modeBadge").textContent = "전체판 · " + num(IDX.n) + " 예측 프레임 · 모델 분류 + 사후(retrospective) 검색";

  // ---------- 탭
  var tabs = document.querySelectorAll(".tabs button");
  function showTab(t) {
    tabs.forEach(function (b) { b.classList.toggle("on", b.dataset.tab === t); b.setAttribute("aria-selected", b.dataset.tab === t); });
    ["search", "stats", "about"].forEach(function (x) { $("tab-" + x).hidden = x !== t; });
    if (t === "search") { renderList(); fitCards(); }
  }
  tabs.forEach(function (b) { b.onclick = function () { showTab(b.dataset.tab); }; });

  // ---------- 필터
  var F = { date: "", y: "", lead: "", cat: "", obs: "", ls: "", d1: "", m0: "", ag: "" };
  for (var m = 10; m <= 360; m += 10) { var o = document.createElement("option"); o.value = m; o.textContent = "+" + m + "분"; $("fLead").appendChild(o); }
  var gb = $("grpBtns");
  LSN.forEach(function (n, i) {
    var bt = document.createElement("button"); bt.type = "button"; bt.dataset.ls = String(i); bt.textContent = n;
    bt.title = "Phase 5 정식 offline 라벨 " + n + " (" + num(ST.ls[["L_only", "S_only", "L+S"][i]]) + " 프레임)";
    bt.onclick = function () { F.ls = F.ls === String(i) ? "" : String(i); syncLsBtns(); apply(true); };
    gb.appendChild(bt);
  });
  function syncLsBtns() { gb.querySelectorAll("button[data-ls]").forEach(function (b) { var on = b.dataset.ls === F.ls; b.classList.toggle("on", on); b.style.background = on ? LSCOL[+b.dataset.ls] : ""; }); }
  [["fDate", "date"], ["fYear", "y"], ["fLead", "lead"], ["fCat", "cat"], ["fObs", "obs"], ["fD1", "d1"], ["fM0", "m0"], ["fAgree", "ag"]].forEach(function (p) {
    $(p[0]).addEventListener("change", function () { F[p[1]] = $(p[0]).value; apply(true); });
  });
  function resetFilters() { F = { date: "", y: "", lead: "", cat: "", obs: "", ls: "", d1: "", m0: "", ag: "" }; ["fDate", "fYear", "fLead", "fCat", "fObs", "fD1", "fM0", "fAgree"].forEach(function (i) { $(i).value = ""; }); syncLsBtns(); }
  $("fReset").onclick = function () { resetFilters(); hideMsg(); apply(true); };

  var list = [];
  function pass(r) {
    if (F.date && r[C.init].slice(0, 8) !== F.date.replace(/-/g, "")) return false;
    if (F.y !== "" && String(r[C.y26]) !== F.y) return false;
    if (F.lead !== "" && String(r[C.lead]) !== F.lead) return false;
    if (F.cat !== "" && String(r[C.c1]) !== F.cat) return false;
    if (F.obs !== "" && String(r[C.obs]) !== F.obs) return false;
    if (F.ls !== "" && String(r[C.ls]) !== F.ls) return false;
    if (F.d1 !== "" && String(r[C.md1]) !== F.d1) return false;
    if (F.m0 !== "" && String(r[C.mm0]) !== F.m0) return false;
    if (F.ag !== "" && String(agreeOf(r)) !== F.ag) return false;
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
      var r = ROWS[list[k]], v = addMin(r[C.init], r[C.lead]);
      html += '<div class="row' + (list[k] === sel ? " sel" : "") + '" data-i="' + list[k] + '" style="top:' + k * RH + 'px">' +
        '<span class="dot" style="background:' + LSCOL[r[C.ls]] + '"></span><span class="t">' + ts(r[C.init]) + " +" + r[C.lead] + "분 → " + v.slice(8, 10) + ":" + v.slice(10, 12) + "</span>" +
        '<span class="s">' + LSN[r[C.ls]] + " · DINOv3 " + MLAB[r[C.md1]] + " · M0 " + MLAB[r[C.mm0]] + (agreeOf(r) === 0 ? " · 불일치" : "") + "</span></div>";
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

  // ---------- 시각 검색 (발표 시각 YYYYMMDDHHMM, query_id YYYYMMDDHHMM_kNN, 날짜 YYYYMMDD)
  function showMsg(h) { var m = $("msg"); m.innerHTML = h; m.hidden = false; }
  function hideMsg() { $("msg").hidden = true; }
  function nearestInit(f) {
    var lo = 0, hi = INITS.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (INITS[mid] < f) lo = mid + 1; else hi = mid; }
    return [INITS[lo - 1], INITS[lo]];
  }
  $("fTimeForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var raw = $("fTime").value.trim(), mk = raw.match(/^(\d{12})_?k(\d{1,2})$/i), d = raw.replace(/\D/g, "");
    if (mk) { gotoQ(mk[1] + "_k" + (mk[2].length === 1 ? "0" : "") + mk[2]); return; }
    if (!d) { showMsg("발표 시각 YYYYMMDDHHMM(예: 202507170240) 또는 query_id(예: 202507170240_k58)로 입력하십시오."); return; }
    if (d.length === 8) { resetFilters(); F.date = d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8); $("fDate").value = F.date; hideMsg(); apply(true);
      if (!list.length) showMsg(esc(F.date) + " 발표 날짜에 포함된 예측 프레임이 없습니다."); return; }
    if (d.length !== 12) { showMsg("발표 시각은 12자리(YYYYMMDDHHMM), 날짜는 8자리(YYYYMMDD), query_id는 YYYYMMDDHHMM_kNN 형식입니다. 입력값: " + esc(raw)); return; }
    gotoInit(d);
  });
  function gotoQ(q) {
    if (!byId.has(q)) { showMsg(esc(q) + " 프레임은 32,055개 정식 L/S 예측 프레임에 없습니다(그 시효에 L/S 객체가 없거나 k41–76 밖)."); return; }
    var i = byId.get(q);
    if (!pass(ROWS[i])) { resetFilters(); apply(false); showMsg("필터를 초기화하고 " + esc(q) + " 프레임으로 이동했습니다."); } else hideMsg();
    select(i);
  }
  function gotoInit(f) {
    if (firstOfInit.has(f)) {
      var i = firstOfInit.get(f);
      resetFilters(); F.date = f.slice(0, 4) + "-" + f.slice(4, 6) + "-" + f.slice(6, 8); $("fDate").value = F.date; apply(false);
      hideMsg(); select(i); return;
    }
    var nb = nearestInit(f);
    var btn = function (x) { return x ? ' <button type="button" data-go="' + x + '">' + ts(x) + "</button>" : ""; };
    showMsg(ts(f) + " 발표 예측에는 정식 L/S 객체가 있는 프레임이 없습니다. 가장 가까운 발표 시각:" + btn(nb[0]) + btn(nb[1]));
  }
  $("msg").addEventListener("click", function (e) { var b = e.target.closest("button[data-go]"); if (b) gotoInit(b.dataset.go); });

  // ---------- 선택 프레임 표시
  var token = 0, curRec = null, curQ = null;
  function showEmpty() {
    sel = -1; updatePos();
    $("info").innerHTML = '<div class="empty">조건에 맞는 프레임이 없습니다. 필터를 조정하십시오.</div>';
    $("cards").innerHTML = ""; $("qImg").removeAttribute("src"); $("qCap").textContent = ""; $("qMiss").hidden = true;
  }
  function select(i) {
    sel = i; var r = ROWS[i], q = r[C.q], my = ++token;
    curQ = q; curRec = null;
    renderList(); ensureVisible(); updatePos();
    var img = $("qImg"); $("qMiss").hidden = true;
    img.onerror = function () { if (my === token) $("qMiss").hidden = false; };
    img.src = qsrc(q);
    $("qCap").textContent = "NowAlpha 예측 반사도(Z=148R^1.59) · 유효 " + ts(addMin(r[C.init], r[C.lead])) + " KST · 실선 빨강 = L, 점선 검정 = S (Phase 5 표시용 윤곽, 모델 입력 아님), 회색 = 영역 밖";
    renderInfo(r, null);
    $("cards").innerHTML = '<div class="empty">불러오는 중…</div>';
    loadDay(q.slice(0, 8)).then(function (rec) {
      if (my !== token) return;
      curRec = rec[q]; renderInfo(r, curRec); renderCards(curRec);
      prefetch();
    }).catch(function () { if (my === token) $("cards").innerHTML = '<div class="empty">상세 자료를 불러오지 못했습니다(data/d 폴더 확인).</div>'; });
  }
  function prefetch() {
    var k = list.indexOf(sel); if (k < 0 || k + 1 >= list.length) return;
    var nq = ROWS[list[k + 1]][C.q];
    loadDay(nq.slice(0, 8)).catch(function () {});
    (new Image()).src = qsrc(nq);
  }
  var GL = ["형태", "조직", "강도", "규모"], GCOLS = ["#2a78d6", "#1baf7a", "#6250d6", "#eb6834"];
  function pbar(p) { return '<div class="pbar"><s></s><i style="left:calc(' + (100 * p).toFixed(2) + '% - 1px)"></i></div>'; }
  function why(st) {
    if (!st) return "…";
    if (st.indexOf("M0_FEATURES_MISSING") >= 0) return "장축 ≥100 km 평가 가능 대류 객체가 없어 7개 특징 중 " + st.split(":")[1].split("|").length + "개 결측 → 예측하지 않음(결측값 대체 없음)";
    return "추론 실패: " + st;
  }
  function modelCard(name, code, p, m) {
    if (code === 2) return '<div class="mcard na"><div class="mn">' + name + '</div><div class="lab"><b>추론 불가</b></div><div class="ptxt"><span class="why">' + esc(why(m ? m[2] : "")) + "</span></div></div>";
    return '<div class="mcard"><div class="mn">' + name + '</div><div class="lab">' + pill(CATS[code]) + "</div>" + pbar(p) +
      '<div class="ptxt">모델 P(TY) = ' + num(p, 3) + (m && m[1] ? " · 임계값 근처(저신뢰)" : "") + "</div></div>";
  }
  var M0F = ["log₁₀ A20", "log₁₀ A40", "log₁₀ 주 대류 객체 면적", "주 객체 장축 (km)", "최대 객체 장축 (km)", "주 객체 최대 반사도 (dBZ)", "강에코 반사도 P90 (dBZ)"];
  function modelDetails(md) {
    var t = "<details><summary>모델 입력·출력 상세</summary><table>" +
      "<tr><td>입력</td><td>이 프레임의 NowAlpha 반사도 장 자체(1 km → 모델 전처리). 화면 영상·L/S 윤곽·문자는 입력이 아닙니다.</td></tr>" +
      "<tr><td>DINOv3 입력</td><td>공통 유효역 · 4 km 256×256 · ≥10 dBZ 채널 0.1+0.9·clip((dBZ−10)/50) · ImageNet 정규화 · CLS(384) → LR</td></tr>" +
      "<tr><td>DINOv3 원점수(logit)</td><td>" + (ok(md.d1[0]) ? num(md.d1[0], 3) : "–") + " · 상태 " + esc(md.d1[2]) + "</td></tr>" +
      "<tr><td>M0 원점수(logit)</td><td>" + (ok(md.m0[0]) ? num(md.m0[0], 3) : "–") + " · 상태 " + esc(md.m0[2].split(":")[0]) + " · 평가 가능 객체 " + num(md.m0[4]) + "개</td></tr>";
    M0F.forEach(function (n, j) { t += "<tr><td>M0 · " + n + "</td><td>" + (ok(md.m0[3][j]) ? num(md.m0[3][j], j < 3 ? 3 : 1) : "결측") + "</td></tr>"; });
    return t + "<tr><td>판정</td><td>P(TY) ≥ 0.5 → TY (동결 임계값), |P−0.5| ≤ 0.05 저신뢰 표시만</td></tr></table></details>";
  }
  function renderInfo(r, d) {
    var v = addMin(r[C.init], r[C.lead]);
    var h = '<div class="qtitle"><span class="dt">' + ts(v) + ' KST</span><span class="ep">유효 시각</span><span class="sub2">query_id ' + esc(r[C.q]) + "</span></div>";
    h += '<div class="tline"><div><span>발표 시각 (init)</span><b>' + ts(r[C.init]) + '</b></div><div class="lead"><span>예측 시효</span><b>+' + r[C.lead] + "분</b> <small>(frame k" + r[C.k] +
      ")</small></div><div><span>유효 시각 (valid)</span><b>" + ts(v) + "</b></div></div>";
    // ① L/S 규칙 기반 객체 식별 (Phase 5) — 이 프레임 자체의 값
    h += '<div class="sec" id="secLS"><div class="sech"><span class="secno">①</span>현재 예측 프레임의 L/S 식별 결과<span class="what">규칙 기반 객체 식별 · Phase 5</span></div><div class="models">' +
      '<div class="mcard"><div class="mn">Phase 5 정식 offline 라벨 · P0_MAIN36_OFFLINE18_BRITT</div><div class="lab">' + lsPills(r[C.nL], r[C.nS]) + '<span class="cnt">' + LSN[r[C.ls]] + "</span></div>" +
      '<div class="lscount">이 프레임: L 객체 <b>' + r[C.nL] + "</b>개 · S 객체 <b>" + r[C.nS] + "</b>개</div>" +
      '<div class="ptxt">Phase 5 규칙 기반 객체 라벨이며, AI 분류 모델의 예측 결과와는 별개입니다.</div></div>' +
      '<div class="mcard"><div class="mn">같은 유효 시각 HSR 관측</div><div class="lab"><b>' + (r[C.obs] ? "관측 있음" : "관측 없음") + "</b></div>" +
      '<div class="ptxt">' + (r[C.obs] ? (d ? "HSR 정식 L/S 사건 " + num(d.nobs) + "개 (MAIN36_OFFLINE)" : "…") : "해당 시각 HSR 자료가 없어 Phase 5 대조가 불가능한 프레임") + "</div></div></div></div>";
    // ② 모델 장면 분류 (DINOv3 · M0)
    var md = d && d.md, a1 = r[C.md1], a0 = r[C.mm0], ag = agreeOf(r);
    h += '<div class="sec" id="secModel"><div class="sech"><span class="secno">②</span>모델 장면 분류<span class="what">DINOv3 · M0 · LINEAR / TY 2범주 · 기존 HSR 모델 동결 추론</span></div><div class="models">' +
      modelCard("DINOv3 + LR (영상 기반)", a1, r[C.pd1], md ? md.d1 : null) + modelCard("M0 (7개 기상 특징 LR)", a0, r[C.pm0], md ? md.m0 : null) + "</div>" +
      '<div class="agree ' + (ag === 1 ? "y" : ag === 0 ? "n" : "na") + '">' + (ag === 1 ? "✓ 두 모델 일치" : ag === 0 ? "⚠ 두 모델 불일치" : "– 한 모델 추론 불가: 일치 여부 판단 안 함") +
      '<span class="gtag">' + (ag === 1 ? "둘 다 " + CATS[a1] : ag === 0 ? "DINOv3 " + CATS[a1] + " · M0 " + CATS[a0] : "") + "</span></div>" +
      '<div class="note">GOLDEN HSR 관측 685프레임으로 학습된 LINEAR/TY 모델을 NowAlpha 예측장에 그대로 적용한 보조 정보입니다. NowAlpha 예측장에서 정확도가 검증되지 않았고, P(TY)는 정확도나 보정된 확률이 아닙니다. L/S 라벨과 GOLDEN Top-5 순위에 영향을 주지 않습니다.</div></div>';
    h += '<div class="note">③ GOLDEN 참조 범주(LINEAR = LINEAR + SEMI_LINEAR, TY)는 사람이 정리한 과거 사례 분류이며 L/S 규칙 식별·모델 분류와 같은 정의가 아닙니다. Top-1 범주와 유사도는 분류 정확도나 확률이 아닙니다.</div>';
    if (d) {
      var m = d.met;
      h += '<div class="kv">' +
        "<div><span>≥40 dBZ 강에코 면적</span><b>" + num(m.a40_km2) + " km²</b></div>" +
        "<div><span>≥20 dBZ 에코 면적</span><b>" + num(m.a20_km2) + " km²</b></div>" +
        "<div><span>주 객체 PCA 장축</span><b>" + num(m.main_major_km) + " km</b></div>" +
        "<div><span>최대 반사도</span><b>" + num(m.max_dbz_p2, 1) + " dBZ</b></div>" +
        "<div><span>강에코 반사도 P90</span><b>" + num(m.strong_dbz_p90, 1) + " dBZ</b></div>" +
        "<div><span>20 dBZ 에코 반사도 P90</span><b>" + num(m.echo20_dbz_p90, 1) + " dBZ</b></div></div>";
      h += "<details><summary>검색 설정 상세</summary><table>" +
        "<tr><td>방법</td><td>32차원 특성 · PHASE9 R3_BALANCED(형태·조직·강도·규모 각 0.25) · 동결 표준화(재적합 없음)</td></tr>" +
        "<tr><td>참조 표현</td><td>GOLDEN HSR → 1 km (NowAlpha와 같은 해상도)</td></tr>" +
        "<tr><td>동일 사건 제외</td><td>" + (d.ex ? esc(d.ex) + " 제외 (±48 h 창 ∪ HSR V2 시스템 ID 연결)" : "제외된 과정 없음") + "</td></tr>" +
        "<tr><td>질의 그룹 가용성</td><td>" + GL.map(function (g, j) { return g + " " + (d.av[j] ? "사용" : "결측"); }).join(" · ") + "</td></tr>" +
        "<tr><td>판정 방식</td><td>사후(retrospective) 검색 · 질의보다 늦은 사례도 참조 가능</td></tr></table></details>";
      h += "<details><summary>추가 기상 지표</summary><table>" +
        "<tr><td>주 객체 직선성 · 종횡비</td><td>" + num(m.main_linearity, 2) + " · " + num(m.main_aspect, 2) + "</td></tr>" +
        "<tr><td>주요 객체 수(≥25 km²)</td><td>" + num(m.n_major) + "</td></tr>" +
        "<tr><td>최대 객체 면적</td><td>" + num(m.largest_area_km2) + " km²</td></tr></table></details>";
      if (md) h += modelDetails(md);
    } else h += '<div class="scr">상세 자료를 불러오는 중…</div>';
    $("info").innerHTML = h;
  }
  function renderCards(d) {
    var h = "";
    d.top.forEach(function (t, k) {
      var gm = GOLD[t[0]] || {};
      h += '<button type="button" class="card" data-k="' + k + '" title="GOLDEN 원본 범주: ' + esc(gm.co || "–") + ' · 과정 ' + esc(gm.p) + '"><img loading="lazy" src="' + gsrc(t[0]) + '" alt="GOLDEN 참조 ' + t[1] + '위">' +
        '<span class="cm"><span class="rk">' + t[1] + "위 " + pill(gm.c || "–") + '</span><span class="ct">' + esc(gm.t) + '</span><span class="ct">과정 ' + esc(gm.p) +
        '</span><span class="sim">유사도 <b>' + num(t[2], 3) + '</b></span><span class="ct">거리 ' + num(t[3], 3) + "</span>" +
        (t[8] ? '<span class="badge fut" title="참조 사례가 질의 유효 시각보다 늦습니다(사후 검색).">사후 참조</span>' : "") +
        (Math.abs(t[9]) < 7 ? '<span class="badge unc" title="질의 유효 시각과 7일 이내입니다.">7일 이내</span>' : "") + "</span></button>";
    });
    $("cards").innerHTML = h;
    $("cards").querySelectorAll(".card").forEach(function (c) { c.onclick = function () { openCmp(+c.dataset.k); }; });
    fitCards();
  }
  function fitCards() {
    var w = $("cards").clientWidth;
    if (!w) return;
    var colw = (w - 40) / 5, ih = Math.max(110, Math.min(200, (colw - 96) * 522 / 422, window.innerHeight * 0.24));
    document.documentElement.style.setProperty("--cardimg", Math.round(ih) + "px");
  }
  window.addEventListener("resize", function () { fitCards(); renderList(); });

  // ---------- 비교 창
  var mk = 0;
  function openCmp(k) {
    if (!curRec) return;
    mk = k; var t = curRec.top[k], gm = GOLD[t[0]] || {}, r = ROWS[sel], qv = curRec.qv, gv = gm.v || [];
    $("mTitle").textContent = "두 영상 비교 · Top-" + t[1] + " / 5";
    var rows = [["≥40 dBZ 강에코 면적", 0, "km²", 0], ["≥20 dBZ 에코 면적", 1, "km²", 0], ["주 객체 장축", 2, "km", 0], ["강에코 반사도 P90", 3, "dBZ", 1], ["최대 반사도", 4, "dBZ", 1]];
    var tb = '<table class="dt"><tr><th>지표</th><th>NowAlpha 예측</th><th>GOLDEN 사례</th><th>차이(사례−예측)</th></tr>' + rows.map(function (x) {
      var a = qv[x[1]], b = gv[x[1]], df = ok(a) && ok(b) ? b - a : null, rt = x[2] === "km²" && ok(a) && ok(b) && a > 0 ? " (×" + (b / a).toFixed(2) + ")" : "";
      return "<tr><td>" + x[0] + "</td><td>" + num(a, x[3]) + " " + x[2] + "</td><td>" + num(b, x[3]) + " " + x[2] + "</td><td>" + (ok(df) ? (df > 0 ? "+" : "") + num(df, x[3]) + rt : "–") + "</td></tr>";
    }).join("") + "</table>";
    var gbars = t[4].map(function (dv, j) {
      var c = t[5][j], st = t[10][j];
      return '<div class="gbar"><span>' + GL[j] + ' 거리</span><span class="b"><i style="width:' + (ok(c) ? (100 * c).toFixed(1) : 0) + "%;background:" + GCOLS[j] + '"></i></span><span>' + num(dv, 3) + " · 기여 " +
        (ok(c) ? (100 * c).toFixed(0) + "%" : "–") + (st === 1 ? " · 결측 벌점" : st === 2 ? " · 양쪽 결측" : "") + "</span></div>";
    }).join("");
    var chips = function (a, dd) { return a && a.length ? a.map(function (x) { return '<span class="chip' + (dd ? " d" : "") + '">' + esc(FEAT[x]) + "</span>"; }).join("") : '<span class="chip">–</span>'; };
    var v = addMin(r[C.init], r[C.lead]);
    var h = '<div class="cmp"><figure><img src="' + qsrc(r[C.q]) + '" alt="NowAlpha 예측"><figcaption><b>NowAlpha 예측</b> · 발표 ' + ts(r[C.init]) + " +" + r[C.lead] + "분 → 유효 " + ts(v) + " KST · " + lsPills(r[C.nL], r[C.nS]) +
      ' <span class="badge">Phase 5 정식 L/S</span> · DINOv3 ' + MLAB[r[C.md1]] + " · M0 " + MLAB[r[C.mm0]] + "</figcaption></figure>" +
      '<figure><img src="' + gsrc(t[0]) + '" alt="GOLDEN 사례"><figcaption><b>GOLDEN 사례 ' + t[1] + "위</b> · " + esc(gm.t) + " KST · 과정 " + esc(gm.p) + " · 참조 범주 " + pill(gm.c || "–") + catOrig(gm) +
      (t[8] ? ' <span class="badge fut">사후 참조</span>' : "") + "</figcaption></figure></div>";
    h += '<div class="diff"><div>' + tb + '<div class="note" style="margin-top:8px">GOLDEN 사례의 참조 범주는 현재 예측 프레임의 정답이 아니며, 검색 결과는 NowAlpha L/S 예측이나 모델 분류가 맞다는 독립적 증거가 아닙니다. ' +
      "검색은 사후(retrospective) 방식이라 질의보다 늦은 사례도 참조할 수 있으며, 이런 사례는 ‘사후 참조’로 표시합니다.</div></div>" +
      "<div><div><b>유사도 " + num(t[2], 3) + "</b> · 종합 거리 " + num(t[3], 3) + ' <span class="badge">유사도 = 1 / (1 + 거리), 4개 그룹 같은 가중치 · 확률 아님</span></div>' + gbars +
      "<div style=\"margin-top:6px\">가장 비슷한 특징</div><div class=\"chips\">" + chips(t[6], false) + "</div>" +
      "<div>가장 다른 특징</div><div class=\"chips\">" + chips(t[7], true) + "</div>" +
      "<details><summary>세부 정보</summary><table>" +
      "<tr><td>GOLDEN 사례 번호</td><td>" + esc(gm.e) + " (과정 " + esc(gm.p) + ")</td></tr>" +
      "<tr><td>참조 범주</td><td>" + esc(gm.c) + (gm.co && gm.co !== gm.c ? " (원본: " + esc(gm.co) + ")" : " (원본과 같음)") + " · 표시 범주 LINEAR = LINEAR + SEMI_LINEAR, TY = TY; 순위·거리는 원래 검색 그대로</td></tr>" +
      "<tr><td>동일 사건 제외</td><td>" + (curRec.ex ? esc(curRec.ex) + " 제외됨 (±48 h 창 ∪ HSR V2 시스템 ID 연결)" : "이 질의에서 제외된 과정 없음") + "</td></tr>" +
      "<tr><td>시간 간격</td><td>질의 유효 시각보다 " + num(Math.abs(t[9]), 1) + "일 " + (t[9] > 0 ? "늦음 (사후 참조)" : "이전") + (Math.abs(t[9]) < 7 ? " (7일 이내)" : "") + "</td></tr>" +
      "<tr><td>거리 해석</td><td>그룹 거리 = 표준화 특징 차이 제곱의 평균; 기여 = 종합 거리 중 그 그룹이 차지하는 비율; 한쪽만 그룹 결측이면 벌점 4.0</td></tr>" +
      "<tr><td>특징 칩</td><td>동결 표준화 기준 |z 차이|가 가장 작은 / 큰 3개 특징</td></tr></table></details></div></div>";
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
  function bars(data, series, opt) {
    // data: [{x, v:[...], n}] — series: [{c, l}]; 값은 비율(0–1) 또는 opt.max 기준
    var W = 640, H = 210, L = 38, B = 34, T = 10, n = data.length, bw = (W - L - 10) / n, ns = series.length, mx = opt.max || 1;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opt.title) + '">';
    [0, .25, .5, .75, 1].forEach(function (y) { var yy = T + (H - T - B) * (1 - y); s += '<line x1="' + L + '" x2="' + (W - 6) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e6e5e0"/><text x="' + (L - 4) + '" y="' + (yy + 4) + '" font-size="10" text-anchor="end" fill="#8a8984">' + (opt.max ? (y * mx).toFixed(2) : (y * 100) + "%") + "</text>"; });
    data.forEach(function (d, i) {
      var x0 = L + i * bw, gw = bw * 0.8 / ns;
      series.forEach(function (p, j) {
        var v = d.v[j] / mx, hh = (H - T - B) * Math.max(0, Math.min(1, v)), x = x0 + bw * 0.1 + j * gw;
        s += '<rect x="' + (x + 1).toFixed(1) + '" y="' + (T + (H - T - B) - hh).toFixed(1) + '" width="' + Math.max(1, gw - 2).toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="2" fill="' + p.c + '"><title>' +
          esc(d.x + " · " + p.l + " " + (opt.max ? num(d.v[j], 3) : (100 * d.v[j]).toFixed(1) + "%") + (d.n ? " (n=" + num(d.n) + ")" : "")) + "</title></rect>";
      });
      if (!opt.skip || i % opt.skip === 0) s += '<text x="' + (x0 + bw / 2) + '" y="' + (H - B + 13) + '" font-size="10.5" text-anchor="middle" fill="#52514e">' + esc(d.x) + "</text>";
      if (d.n && !opt.skip) s += '<text x="' + (x0 + bw / 2) + '" y="' + (H - B + 26) + '" font-size="9.5" text-anchor="middle" fill="#8a8984">' + num(d.n) + "</text>";
    });
    return s + "</svg>";
  }
  function renderStats() {
    var n = ST.n, MD = ST.models, LSK = ["L_only", "S_only", "L+S"];
    var two = function (o) { return (o.LINEAR || 0) + (o.TY || 0); };
    var h = '<div class="note">정답 라벨이 없으므로 정확도는 계산하지 않습니다. 모든 비율은 기술 통계이며 분류 정확도가 아닙니다. GOLDEN 참조 범주는 LINEAR(= LINEAR + SEMI_LINEAR)와 TY 2개로 표시하며, 검색 순위·거리·과정은 정식 결과 그대로입니다.</div>';
    h += '<div class="tiles"><div class="tile"><div class="k">질의 예측 프레임</div><div class="v">' + num(n) + '</div><div class="s">Phase 5 정식 L/S ≥ 1 · 예측 파일 ' + num(ST.files) + " · 2025 " + num(ST.year["2025"]) + " · 2026 " + num(ST.year["2026"]) + "</div></div>" +
      '<div class="tile"><div class="k">① L/S 유형 (규칙 기반, 프레임 수)</div><div class="v" style="font-size:19px">' + LSK.map(function (k) { return num(ST.ls[k]); }).join(" · ") + '</div><div class="s">L only · S only · L+S</div></div>' +
      '<div class="tile"><div class="k">② 모델 분류 TY 비율 (DINOv3 · M0)</div><div class="v" style="font-size:19px">' + pct(MD.d1.TY, MD.d1_ok) + " · " + pct(MD.m0.TY, MD.m0_ok) + '</div><div class="s">추론 OK: DINOv3 ' + num(MD.d1_ok) + " · M0 " + num(MD.m0_ok) + " (M0 불가 " + num(n - MD.m0_ok) + ")</div></div>" +
      '<div class="tile"><div class="k">③ GOLDEN 참조</div><div class="v">' + num(ST.lib_n) + '</div><div class="s">' + pill("LINEAR") + " " + num(ST.lib2.LINEAR) + " (원본 LINEAR " + num(ST.lib_orig.LINEAR) + " + SEMI_LINEAR " + num(ST.lib_orig.SEMI_LINEAR) + ") · " + pill("TY") + " " + num(ST.lib2.TY) + " · " + ST.lib_proc + "개 과정</div></div></div>";
    h += '<div class="sbox"><h2>세 결과는 서로 독립입니다</h2><p class="indep"><b>① L/S</b> = Phase 5 규칙 기반 객체 식별(질의 프레임 선택에만 사용) · <b>② DINOv3 / M0</b> = 기존 HSR 모델의 장면 분류(동결 추론, 보조 정보) · <b>③ GOLDEN Top-5</b> = 32차원 R3_BALANCED 과거 유사 사례 검색. ' +
      "모델 결과는 L/S 라벨을 바꾸지 않고, 검색 순위·참조 범주 선택에도 쓰이지 않습니다(범주별 따로 검색하거나 모델 범주로 걸러내지 않음).</p></div>";
    h += '<div class="sbox"><h2>L/S 유형별 질의</h2><div class="gcards">' + [["L_only", 0], ["S_only", 1], ["L+S", 2]].map(function (p) {
      var a = ST.by_ls[p[0]], t = a[0] + a[1], b = MD.by_ls[p[0]];
      return '<div class="gcard" style="border-top-color:' + LSCOL[p[1]] + '"><div class="k">' + LSN[p[1]] + ' (Phase 5 정식 offline)</div><div class="v">' + num(ST.ls[p[0]]) + '</div><div class="s">' + pct(ST.ls[p[0]], n) +
        " · Top-1 참조 TY " + pct(a[1], t) + "<br>DINOv3 TY " + pct(b.d1.TY, two(b.d1)) + " · M0 TY " + pct(b.m0.TY, two(b.m0)) + " (M0 불가 " + num(b.m0_unavail) + ')</div><button type="button" data-ls="' + p[1] + '">목록 보기</button></div>';
    }).join("") + '<div class="gcard" style="border-top-color:var(--ink3)"><div class="k">모델·참조 범주별 목록</div><div class="v">' + num(n) + '</div><div class="s">비율은 분류 정확도가 아닙니다</div>' +
      '<button type="button" data-f="d1" data-v="1">DINOv3 TY</button> <button type="button" data-f="m0" data-v="1">M0 TY</button> <button type="button" data-f="ag" data-v="0">두 모델 불일치</button> <button type="button" data-f="m0" data-v="2">M0 추론 불가</button> ' +
      CATS.map(function (c, j) { return '<button type="button" data-cat="' + j + '">Top-1 ' + c + "</button> "; }).join("") + "</div></div></div>";
    // ---- ② 모델 장면 분류
    var mser = [{ c: "#6250d6", l: "DINOv3 TY" }, { c: "#1baf7a", l: "M0 TY" }];
    var mlg = '<div class="legend">' + mser.map(function (s) { return '<span><i style="background:' + s.c + '"></i>' + s.l + "</span>"; }).join("") + "</div>";
    var mls = LSK.map(function (k, i) { var b = MD.by_ls[k]; return { x: LSN[i], v: [b.d1.TY / two(b.d1), b.m0.TY / two(b.m0)], n: b.n }; });
    mls.push({ x: "전체", v: [MD.d1.TY / MD.d1_ok, MD.m0.TY / MD.m0_ok], n: n });
    mls.push({ x: "참고: HSR 12,631", v: [MD.hsr12631.d1_TY_share, MD.hsr12631.m0_TY_share], n: 12631 });
    h += '<div class="two"><div class="sbox chart"><h2>② 모델 TY 비율 (L/S 유형별)</h2>' + mlg + bars(mls, mser, { title: "L/S 유형별 모델 TY 비율" }) +
      '<div class="s" style="font-size:12px;color:var(--ink2)">TY 비율 = 추론 OK 프레임 중 P(TY) ≥ 0.5 비율. 마지막 막대는 기존 HSR 비GOLDEN 12,631 프레임의 같은 모델 결과(관측장)입니다. 숫자 = 프레임 수.</div></div>' +
      '<div class="sbox chart"><h2>② 선행시간별 모델 TY 비율</h2>' + mlg + bars(MD.lead.map(function (x) { return { x: "+" + x[0], v: [x[2], x[3]], n: x[1] }; }), mser, { title: "선행시간별 모델 TY 비율", skip: 5 }) +
      '<div class="s" style="font-size:12px;color:var(--ink2)">x축 = 예측 시효(분). M0 추론 불가 비율(전체) ' + pct(n - MD.m0_ok, n) + ".</div></div></div>";
    var ct = MD.crosstab, xt = MD.x_top1;
    var xrow = function (m, lab) { var a = xt[m][lab], t = two(a); return "<tr><td>" + (m === "d1" ? "DINOv3 " : "M0 ") + lab + '</td><td class="c">' + num(t) + '</td><td class="c">' + pct(a.LINEAR, t) + '</td><td class="c">' + pct(a.TY, t) + "</td></tr>"; };
    h += '<div class="two"><div class="sbox"><h2>② DINOv3 × M0 (두 모델 모두 추론 OK ' + num(MD.both_ok) + '프레임)</h2><table class="dt xt"><tr><th></th><th>M0 LINEAR</th><th>M0 TY</th></tr>' +
      '<tr><td>DINOv3 LINEAR</td><td class="c">' + num(ct["D1_LINEAR|M0_LINEAR"]) + '</td><td class="c">' + num(ct["D1_LINEAR|M0_TY"]) + "</td></tr>" +
      '<tr><td>DINOv3 TY</td><td class="c">' + num(ct["D1_TY|M0_LINEAR"]) + '</td><td class="c">' + num(ct["D1_TY|M0_TY"]) + "</td></tr></table>" +
      '<div class="s" style="font-size:12px;color:var(--ink2);margin-top:6px">일치율 ' + pct(MD.agree, MD.both_ok) + " (일치는 정답이라는 뜻이 아닙니다). 저신뢰(|P−0.5| ≤ 0.05): DINOv3 " + num(MD.d1_low_conf) + " · M0 " + num(MD.m0_low_conf) + ". M0 추론 불가 " + num(n - MD.m0_ok) +
      "(장축 ≥100 km 평가 가능 대류 객체 없음 → 7개 특징 결측; 결측값을 채워 넣지 않음). DINOv3 추론 실패 " + num(n - MD.d1_ok) + ".</div></div>" +
      '<div class="sbox"><h2>② 모델 범주 × ③ Top-1 참조 범주 (동시 출현, 정확도 아님)</h2><table class="dt xt"><tr><th>모델 출력</th><th>프레임</th><th>Top-1 LINEAR</th><th>Top-1 TY</th></tr>' +
      xrow("d1", "LINEAR") + xrow("d1", "TY") + xrow("m0", "LINEAR") + xrow("m0", "TY") + "</table>" +
      '<div class="s" style="font-size:12px;color:var(--ink2);margin-top:6px">두 값은 서로 다른 입력(DINOv3 영상 특징 / 7개 특징 / 32차원 특징)에서 독립적으로 계산됩니다. 면적이 큰 프레임에서 함께 TY 쪽으로 기우는 경향(면적 공통 요인)이 있어 일치를 독립 증거로 보면 안 됩니다.</div></div></div>';
    var sh = MD.cls_nn, qc = MD.qc, rg = MD.regression;
    h += '<div class="sbox"><h2>② 분포 차이와 검증 기록 (NowAlpha 예측장 vs HSR 관측장)</h2><div class="tw"><table class="dt"><tr><th>항목</th><th>NowAlpha 32,055</th><th>HSR 비GOLDEN 12,631</th><th>설명</th></tr>' +
      "<tr><td>DINOv3 TY 비율</td><td>" + pct(MD.d1.TY, MD.d1_ok) + "</td><td>" + pct(MD.hsr12631.d1_TY_share, 1) + "</td><td>같은 모델·같은 임계값</td></tr>" +
      "<tr><td>M0 TY 비율</td><td>" + pct(MD.m0.TY, MD.m0_ok) + "</td><td>" + pct(MD.hsr12631.m0_TY_share, 1) + "</td><td>같은 모델·같은 임계값</td></tr>" +
      "<tr><td>DINOv3 P(TY) 중앙값</td><td>" + num(MD.p_quantiles.d1[2], 3) + "</td><td>" + num(MD.hsr12631.d1_p[2], 3) + "</td><td></td></tr>" +
      "<tr><td>CLS 최근접 GOLDEN 코사인 거리 중앙값</td><td>" + num(sh.nowalpha, 3) + "</td><td>" + num(sh.hsr12631, 3) + "</td><td>GOLDEN 자기 제외 " + num(sh.golden_leave_self, 3) + "; NowAlpha 중 HSR P90 초과 " + pct(sh.nowalpha_gt_hsr_p90, 1) + "</td></tr>" +
      "<tr><td>모델 입력 ≥10 dBZ 화소 수 중앙값 (256×256)</td><td>" + num(qc.ch0_nonzero_median[0]) + "</td><td>" + num(qc.ch0_nonzero_median[1]) + "</td><td>예측장이 더 매끄럽고 영역 경계에서 잘림</td></tr>" +
      "<tr><td>모델 입력 최대값 중앙값</td><td>" + num(qc.ch0_max_median[0], 3) + "</td><td>" + num(qc.ch0_max_median[1], 3) + "</td><td>0.1+0.9·clip((dBZ−10)/50)</td></tr></table></div>" +
      '<div class="s" style="font-size:12px;color:var(--ink2);margin-top:6px">회귀 검증: 기존 HSR ' + rg.n + "프레임에서 이 추론 코드가 저장된 결과를 재현(최대 차이 DINOv3 " + rg.d1_maxdiff.toExponential(1) + ", M0 " + rg.m0_maxdiff.toExponential(1) + ", 라벨 100% 일치). 같은 프레임을 NowAlpha와 같은 1 km 표현으로 바꿔도 라벨 일치 DINOv3 " + pct(rg.km1_d1_label_eq, 1) + " · M0 " + pct(rg.km1_m0_label_eq, 1) +
      " (최대 |ΔP| " + num(rg.km1_d1_maxdp, 3) + " / " + num(rg.km1_m0_maxdp, 3) + "). 따라서 NowAlpha와 HSR의 TY 비율 차이는 1 km 해상도 때문이 아니며, 예측장 자체의 특성(평활·약화·영역 경계)과 대상 프레임 구성 차이에서 오는 것으로 보입니다(두 요인은 분리하지 않음). 격자 방향: 학습 공통 유효역이 NowAlpha 유효역 안에 100% 포함(IoU " + num(MD.orientation.iou_as_used, 3) + ", 상하 반전 시 " + num(MD.orientation.iou_flipped_ud, 3) + ").</div></div>";
    // ---- ③ GOLDEN 검색
    var lg = '<div class="legend">' + CATS.map(function (c) { return '<span><i style="background:' + CATCOL[c] + '"></i>' + c + (c === "LINEAR" ? " (+SEMI_LINEAR)" : "") + "</span>"; }).join("") + "</div>";
    var ls = LSK.map(function (k, i) { var a = ST.by_ls[k], t = a[0] + a[1]; return { x: LSN[i], v: [a[0] / t, a[1] / t], n: t }; });
    var tot = two(ST.top1);
    ls.push({ x: "전체", v: [ST.top1.LINEAR / tot, ST.top1.TY / tot], n: tot });
    var yr = ["2025", "2026"].map(function (y) { var a = ST.by_year[y], t = a[0] + a[1]; return { x: y, v: [a[0] / t, a[1] / t], n: t }; });
    var ser = CATS.map(function (c) { return { c: CATCOL[c], l: c }; });
    h += '<div class="two"><div class="sbox chart"><h2>③ Top-1 GOLDEN 참조 범주 (질의 L/S 유형별)</h2>' + lg + bars(ls, ser, { title: "L/S 유형별 Top-1 참조 범주 비율" }) +
      '<div class="s" style="font-size:12px;color:var(--ink2)">참조 라이브러리: LINEAR ' + num(ST.lib2.LINEAR) + "프레임/" + ST.lib_proc2.LINEAR + "과정, TY " + num(ST.lib2.TY) + "프레임/" + ST.lib_proc2.TY + "과정. 범주 비율은 라이브러리 구성의 영향을 받습니다. 원 3범주 Top-1: " +
      ORIG.map(function (c) { return c + " " + num(ST.top1_orig[c]); }).join(" · ") + ".</div></div>" +
      '<div class="sbox chart"><h2>③ Top-1 GOLDEN 참조 범주 (연도별)</h2>' + lg + bars(yr, ser, { title: "연도별 Top-1 참조 범주 비율" }) +
      '<div class="s" style="font-size:12px;color:var(--ink2)">Top-5 전체 ' + num(ST.rows) + "행: LINEAR " + pct(ST.top5.LINEAR, ST.rows) + " · TY " + pct(ST.top5.TY, ST.rows) + ". Top-5 다수 범주: LINEAR " + num(ST.top5_major.LINEAR) + " · TY " + num(ST.top5_major.TY) + " 질의.</div></div></div>";
    var mxl = Math.max.apply(null, ST.lead.map(function (x) { return x[2]; }));
    h += '<div class="two"><div class="sbox"><h2>③ 순위별 거리 분포</h2><table class="dt"><tr><th>순위</th><th>중앙값</th><th>P10</th><th>P90</th><th>유사도 S (중앙값)</th></tr>' +
      ST.by_rank.map(function (x) { return "<tr><td>" + x[0] + "위</td><td>" + num(x[1], 3) + "</td><td>" + num(x[2], 3) + "</td><td>" + num(x[3], 3) + "</td><td>" + num(1 / (1 + x[1]), 3) + "</td></tr>"; }).join("") +
      '</table><div class="s" style="font-size:12px;color:var(--ink2);margin-top:6px">Top-1 평균 기여: 형태 ' + pct(ST.contrib.contrib_morphology, 1) + " · 조직 " + pct(ST.contrib.contrib_organization, 1) + " · 강도 " + pct(ST.contrib.contrib_intensity, 1) + " · 규모 " + pct(ST.contrib.contrib_scale, 1) + "</div></div>" +
      '<div class="sbox chart"><h2>③ 선행시간별 Top-1 거리 중앙값</h2>' + bars(ST.lead.map(function (x) { return { x: "+" + x[0], v: [x[2]], n: x[1] }; }), [{ c: "#2a78d6", l: "Top-1 거리 중앙값" }], { title: "선행시간별 Top-1 거리", max: Math.ceil(mxl * 5) / 5, skip: 5 }) +
      '<div class="s" style="font-size:12px;color:var(--ink2)">x축 = 예측 시효(분). 막대에 마우스를 올리면 프레임 수가 보입니다.</div></div></div>';
    h += '<div class="sbox"><h2>③ 주 방안 vs 민감도 실험 · 진단</h2><p style="margin:0 0 6px;font-size:12.5px;color:var(--ink2)">아래 값은 정식 결과와의 일치도입니다(정확도 아님). 민감도 실험과 진단은 정식 결과를 대체하지 않습니다.</p><div class="tw"><table class="dt"><tr><th>실험</th><th>구분</th><th>Top-1 같은 프레임</th><th>Top-1 같은 범주 (LINEAR·TY)</th><th>Top-1 같은 범주 (원 3범주)</th><th>Top-5 평균 중복</th><th>Top-1 D 중앙값 (정식)</th><th>Top-1 D 중앙값 (실험)</th></tr>' +
      ST.sens.map(function (s) { return "<tr><td>" + esc(s.name) + '</td><td><span class="kind' + (s.kind === "진단" ? " d" : "") + '">' + s.kind + "</span></td><td>" + pct(s.top1_same_frame, 1) + "</td><td>" + (ok(s.cat2) ? pct(s.cat2, 1) : "–") + "</td><td>" + pct(s.top1_same_category, 1) + "</td><td>" + num(s.top5_frame_overlap_mean, 2) + " / 5</td><td>" + num(s.top1_D_main_median, 3) + "</td><td>" + num(s.top1_D_sens_median, 3) + "</td></tr>"; }).join("") +
      '</table></div><div class="s" style="font-size:12px;color:var(--ink2);margin-top:6px">“–” = 질의별 Top-1이 저장되지 않은 진단(원 3범주 값만 기존 분석에서 제공). 진단 행은 특징 또는 가중치를 바꾼 결과라 거리 값을 정식 결과와 직접 비교할 수 없습니다. NowAlpha 조밀도 z가 +5에서 절단되는 프레임 ' + pct(ST.clip, 1) + ".</div></div>";
    h += '<div class="sbox"><h2>③ Top-1 참조 과정 빈도 (상위 12)</h2><table class="dt"><tr><th>과정</th><th>참조 범주</th><th>원본 범주</th><th>라이브러리 프레임</th><th>Top-1 횟수</th><th>비율</th></tr>' +
      ST.proc.map(function (p) { return "<tr><td>" + esc(p[0]) + "</td><td>" + pill(p[1]) + "</td><td>" + p[2].split("|").map(pill).join(" ") + "</td><td>" + num(p[3]) + "</td><td>" + num(p[4]) + "</td><td>" + pct(p[5], 1) + "</td></tr>"; }).join("") + "</table></div>";
    h += '<div class="two"><div class="sbox"><h2>면적 관계</h2><p style="margin:0">질의 vs Top-1 면적 Spearman ρ: ≥20 dBZ ' + num(ST.area.rho20, 2) + ", ≥40 dBZ " + num(ST.area.rho40, 2) + " (기존 HSR 검색 0.83). 규모 그룹을 뺀 진단 검색에서는 ≥40 dBZ ρ = " + num(ST.area.rho40_noscale, 2) +
      ". 모델 P(TY)와 ≥20 dBZ 면적의 Spearman ρ: DINOv3 " + num(MD.rho_area.d1_p_vs_logA20, 2) + " · M0 " + num(MD.rho_area.m0_p_vs_logA20, 2) + ".</p></div>" +
      '<div class="sbox"><h2>사후(retrospective) 검색</h2><p style="margin:0">Top-5 중 참조가 질의 유효 시각보다 늦은 비율 ' + pct(ST.time.after_all, 1) + " (" + num(ST.time.rows_after) + "행, Top-1 " + pct(ST.time.after_top1, 1) + "; 2025년 질의 " + pct(ST.time.after_2025, 1) + ", 2026년 0%). " +
      "같은 기상 과정(±48 h 창 ∪ HSR V2 시스템 ID 연결)으로 GP29/GP30을 제외한 질의 " + num(ST.time.excl) + "개. 실시간 운용에는 참조 시각 < 질의 유효 시각 조건이 추가로 필요합니다.</p></div></div>";
    $("stats").innerHTML = h;
    $("stats").querySelectorAll("button[data-ls]").forEach(function (b) { b.onclick = function () { resetFilters(); F.ls = b.dataset.ls; syncLsBtns(); showTab("search"); apply(true); }; });
    $("stats").querySelectorAll("button[data-cat]").forEach(function (b) { b.onclick = function () { resetFilters(); F.cat = b.dataset.cat; $("fCat").value = F.cat; showTab("search"); apply(true); }; });
    $("stats").querySelectorAll("button[data-f]").forEach(function (b) { b.onclick = function () { resetFilters(); F[b.dataset.f] = b.dataset.v; $({ d1: "fD1", m0: "fM0", ag: "fAgree" }[b.dataset.f]).value = b.dataset.v; showTab("search"); apply(true); }; });
  }
  function renderAbout() {
    var MD = ST.models;
    $("about").innerHTML = '<div class="sbox about"><h2>이 도구에 대하여</h2><ul>' +
      "<li>대상: NowAlpha2025 예측(발표 파일 × frame k41–76, +10–360분) 중 Phase 5 정식 offline 기준(P0_MAIN36_OFFLINE18_BRITT)으로 L 또는 S 객체가 1개 이상 식별된 " + num(ST.n) + "개 예측 프레임 전체 (L only " + num(ST.ls.L_only) + " · S only " + num(ST.ls.S_only) + " · L+S " + num(ST.ls["L+S"]) + "). HSR과의 매칭(Hit) 여부와 무관합니다.</li>" +
      "<li><b>세 결과는 서로 독립입니다.</b> ① L/S = 규칙 기반 객체 식별(Phase 5) · ② DINOv3/M0 = 모델 장면 분류 · ③ GOLDEN Top-5 = 과거 유사 사례 검색. 어느 결과도 다른 결과를 수정하지 않습니다.</li>" +
      "<li>① L/S: 화면의 L/S 정보는 선택한 그 프레임의 Phase 5 정식 라벨(객체 수 포함)입니다. 영상의 빨간 실선 = L, 검은 점선 = S는 표시용 윤곽입니다.</li>" +
      "<li>② 모델 분류: 기존 HSR 페이지의 두 모델(DINOv3 ViT-S/16 동결 CLS + LR, M0 7개 기상 특징 LR)을 재학습 없이 NowAlpha 예측장에 적용했습니다. 두 모델 모두 LINEAR(= LINEAR + SEMI_LINEAR) / TY 2범주이며 NO_MCS 범주는 없습니다. 입력은 레이더 반사도 장 자체이고 화면 영상·윤곽·문자는 입력이 아닙니다. P(TY) ≥ 0.5 → TY. " +
      "M0는 장축 ≥100 km 평가 가능 대류 객체가 없으면 예측하지 않습니다(추론 불가 " + num(ST.n - MD.m0_ok) + "). NowAlpha 예측장에서 정확도가 검증되지 않은 보조 정보입니다. TY 비율: DINOv3 " + pct(MD.d1.TY, MD.d1_ok) + " · M0 " + pct(MD.m0.TY, MD.m0_ok) + " (기존 HSR 관측 12,631프레임: " + pct(MD.hsr12631.d1_TY_share, 1) + " · " + pct(MD.hsr12631.m0_TY_share, 1) + "; 분포 차이는 통계 탭).</li>" +
      "<li>③ 유사 사례: 기존 32차원 기상 특성(형태 7 · 조직 10 · 강도 9 · 규모 6)과 PHASE9 R3_BALANCED(4개 그룹 같은 가중치, 동결 표준화). GOLDEN " + num(ST.lib_n) + "프레임을 한 번에 거리순 정렬하고, 같은 기상 과정에서는 1프레임만 선택합니다. 범주별 따로 검색하거나 모델 범주로 걸러내지 않으며 kNN 투표도 없습니다.</li>" +
      "<li>참조 범주 표시: LINEAR = 원본 LINEAR " + num(ST.lib_orig.LINEAR) + " + SEMI_LINEAR " + num(ST.lib_orig.SEMI_LINEAR) + " (" + num(ST.lib2.LINEAR) + "프레임), TY = " + num(ST.lib2.TY) + "프레임. 원본 범주는 비교 창의 세부 정보와 카드 툴팁에 남아 있습니다. 순위·거리·과정 ID는 바뀌지 않습니다.</li>" +
      "<li>NowAlpha는 1 km 격자이므로 GOLDEN 참조도 같은 HSR 파일의 1 km 표현으로 특성을 계산했습니다(정식 방안). 0.5 km 원 특성 결과는 민감도 실험으로 통계 탭에 비교되어 있습니다.</li>" +
      "<li>동일 사건 제외: 질의 유효 시각이 GOLDEN 과정 [시작−48 h, 종료+48 h] 안이거나, 질의 L/S 객체와 정합된 HSR V2 시스템이 GP29/GP30 프레임에 나타나면 그 과정을 제외합니다.</li>" +
      "<li>사후(retrospective) 검색: 질의보다 늦은 GOLDEN 사례도 참조할 수 있습니다(‘사후 참조’). 실시간 과거 사례 검색과 다릅니다.</li>" +
      "<li>유사도 S = 1 / (1 + 거리)와 모델 P(TY)는 표시용 점수이며 정확도가 아닙니다. Top-1 범주 비율·모델 TY 비율·두 모델 일치율은 분류 정확도가 아닙니다.</li>" +
      "<li>모든 레이더 영상은 같은 색표·같은 지도 범위로 그린 실제 영상입니다. 질의 = NowAlpha 예측 강수(Z = 148R<sup>1.59</sup>로 dBZ 변환); 참조 = GOLDEN HSR 관측의 1 km 표현(검은 선 = 장축이 가장 긴 ≥40 dBZ 주 객체). 1 dBZ 미만은 무에코(흰색), 회색 = 영역 밖.</li>" +
      "<li>모든 거리·유사도·순위·모델 출력은 정식 결과 파일에서 그대로 읽은 값입니다. 이 페이지는 아무것도 다시 계산하지 않습니다.</li>" +
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
  renderStats(); renderAbout(); syncLsBtns();
  apply(true);
  window.NG2_APP = { select: select, gotoQ: gotoQ, apply: apply, F: function () { return F; }, list: function () { return list; }, sel: function () { return sel; }, rec: function () { return curRec; }, cur: function () { return curQ; } };
})();
