import { analyzeVideo, startCamera, SAMPLE_FPS } from "./poseAnalysis.js";
import { analyzeFrames, REGION_LABEL, THRESHOLDS } from "./analysis.js";
import { judge } from "./findings.js";
import { HOSPITALS, SORT_EXPLAIN, filterAndSortHospitals } from "./hospitals.js";
import { buildSummary, buildPayload, simulateSubmit } from "./summary.js";
import { validateVideoMeta, readVideoDuration } from "./videoValidator.js";
import { saveAssessment, loadAssessments } from "./storage.js";
import { compareResults, getPreviousAssessment } from "./compare.js";
import { SAMPLES } from "./sample.js";
import { REGIONS, ONSETS, FREQUENCIES, IMPACTS, TREATMENTS, WARNINGS, TASKS, VIEWS, readQuestionnaire, validateQuestionnaire, needsEmergency } from "./questionnaire.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const STEPS = { login: "로그인", survey: "1/4 자가 설문", upload: "2/4 영상 분석", result: "3/4 통합 결과", hospital: "4/4 병원 연계" };

const USERS="linkmedi.users", SESSION="linkmedi.session";
const readUsers=()=>{ try{return JSON.parse(localStorage.getItem(USERS)??"{}");}catch{return {};} };
async function hashPin(id,pin){ const s="linkmedi:"+id+":"+pin; if(!crypto?.subtle) return btoa(unescape(encodeURIComponent(s))); const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
const newSurvey = () => ({ regions: [], pain: null, onset: null, frequency: null, impact: null, treatment: null, warnings: [] });
const state = { survey: newSurvey(), surveyErr: [], user: localStorage.getItem(SESSION), signup: false, loginErr: "", screen: localStorage.getItem(SESSION) ? "survey" : "login", mode: "upload", consent: false, errors: [], busy: false, progress: 0,
  analysis: null, judged: null, taskType: "welding", viewAngle: "side", comparison: null, rePain: null, choice: null, filters: {}, sort: "recommend", sent: null, cam: null, recording: false, recSec: 0 };
let timer = null, abort = null;

async function stopCam() {
  clearInterval(timer);
  if (state.cam) { await state.cam.stop(); state.cam = null; }
  state.recording = false;
}

function go(screen) {
  stopCam();
  state.screen = screen;
  render();
  window.scrollTo(0, 0);
}

function finish(analysis) {
  state.analysis = analysis;
  state.judged = judge(analysis, readQuestionnaire(state.survey));
  state.sent = null; state.choice = null; state.rePain = null;
  const cur = { id: analysis.assessmentId, taskType: state.taskType, viewAngle: state.viewAngle, analysis };
  const prev = getPreviousAssessment(loadAssessments().filter((a) => a.userId === state.user).map((a) => ({ ...a, id: a.assessmentId })), { taskType: state.taskType });
  state.comparison = prev ? compareResults(prev, cur) : null;
  {
    saveAssessment({ assessmentId: analysis.assessmentId, createdAt: analysis.createdAt, analysis,
      regions: state.judged.findings.map((f) => f.region), taskType: state.taskType, viewAngle: state.viewAngle, painScore: state.survey.pain, survey: readQuestionnaire(state.survey), userId: state.user });
  }
  go("result");
}

function render() {
  $("#stepLabel").innerHTML = state.user ? `${esc(state.user)}님 <button class="chip" id="logout" style="min-height:32px;padding:0 10px;font-size:13px">로그아웃</button>` : "";
  if (state.screen !== "login") $("#stepLabel").insertAdjacentText("afterbegin", STEPS[state.screen] + " · ");
  const lo = $("#logout"); if (lo) lo.onclick = () => { localStorage.removeItem(SESSION); state.user = null; state.analysis = null; state.survey = newSurvey(); go("login"); };
  $("#app").innerHTML = { login: viewLogin, survey: viewSurvey, upload: viewUpload, result: viewResult, hospital: viewHospital }[state.screen]();
  bind();
}

function viewLogin() {
  return `<div class="card"><h2>${state.signup ? "회원가입" : "로그인"}</h2>
    <p class="muted">작업 자세 분석 후 병원 연계까지 도와드려요. 계정은 이 기기에만 저장되는 데모예요.</p>
    ${state.loginErr ? `<div class="err">${esc(state.loginErr)}</div>` : ""}
    <input id="uid" placeholder="아이디 (영문/숫자 3자 이상)" autocomplete="username" style="width:100%;min-height:48px;font-size:16px;margin:4px 0 10px">
    <input id="pin" type="password" inputmode="numeric" placeholder="비밀번호 (4자 이상)" autocomplete="current-password" style="width:100%;min-height:48px;font-size:16px;margin:4px 0 10px">
    <button class="btn" id="authGo">${state.signup ? "가입하고 시작" : "로그인"}</button>
    <button class="btn ghost" id="authSwitch">${state.signup ? "이미 계정이 있어요" : "처음이에요 (회원가입)"}</button>
    <button class="btn sec" id="guest">로그인 없이 체험</button></div>`;
}

function viewSurvey() {
  const s = state.survey;
  const chips = (arr, sel, attr) => arr.map(([k, l]) => `<button class="chip ${sel.includes(k) ? "on" : ""}" data-${attr}="${k}">${l}</button>`).join("");
  return `<div class="card"><h2>간단 자가 설문</h2><p class="muted">1분이면 끝나요. 영상 분석 결과와 합쳐서 판단해요.</p>
    ${state.surveyErr.map((e) => `<div class="err">${esc(e)}</div>`).join("")}
    <b>1. 불편한 부위 (복수 선택)</b><div class="chips">${chips(REGIONS, s.regions, "sreg")}</div>
    <p><b>2. 통증 정도</b> <span class="muted">0=없음 · 10=매우 심함</span></p>
    <div class="scale">${Array.from({ length: 11 }, (_, i) => `<button class="chip ${s.pain === i ? "on" : ""}" data-spain="${i}">${i}</button>`).join("")}</div>
    <p><b>3. 언제부터 불편했나요?</b></p><div class="chips">${chips(ONSETS, s.onset ? [s.onset] : [], "sonset")}</div>
    <p><b>4. 얼마나 자주 불편한가요?</b></p><div class="chips">${chips(FREQUENCIES, s.frequency ? [s.frequency] : [], "sfreq")}</div>
    <p><b>5. 일·생활에 영향이 있나요?</b> <span class="muted">(선택)</span></p><div class="chips">${chips(IMPACTS, s.impact ? [s.impact] : [], "simp")}</div>
    <p><b>6. 진료 이력</b></p><div class="chips">${chips(TREATMENTS, s.treatment ? [s.treatment] : [], "streat")}</div>
    <p><b>7. 해당되는 주의 신호 (없으면 건너뛰기)</b></p><div class="chips">${chips(WARNINGS, s.warnings, "swarn")}</div>
    ${s.warnings.length ? `<div class="alert">주의 신호가 있어요. 영상 결과와 상관없이 <b>의료진 상담을 권장해요.</b>${needsEmergency(readQuestionnaire(s)) ? " 갑자기 심해지거나 응급이 의심되면 <b>119</b>에 연락하세요." : ""}</div>` : ""}
    <div class="muted">설문은 진단·점수 판정을 하지 않고 참고 정보로만 쓰여요.</div></div>
  <button class="btn" id="surveyNext">다음: 영상 분석</button>`;
}

function viewUpload() {
  const cam = state.mode === "camera";
  return `
  <div class="card"><h2>작업 영상으로 자세 분석</h2>
    <p class="muted">작업하는 모습을 옆에서 찍은 영상을 올리거나 카메라로 바로 촬영하세요. 관절 각도와 ROM을 측정해 의심 소견과 병원 연계를 안내해요. 영상은 이 기기에서만 처리되고 저장·전송되지 않아요.</p>
    <div class="info"><b>촬영 가이드</b> 머리~발끝 전신이 나오게, 옆모습 또는 45° 각도, 10~30초, 밝은 곳에서 찍어 주세요.</div>
    ${typeof Pose === "undefined" ? `<div class="alert">분석 라이브러리를 불러오지 못했어요(인터넷 확인). 새로고침하거나 아래 샘플로 흐름을 체험할 수 있어요. <button class="chip" id="reload">다시 시도</button></div>` : ""}
    <p><b>작업 종류</b></p><div class="chips">${TASKS.map(([k, l]) => `<button class="chip ${state.taskType === k ? "on" : ""}" data-task="${k}">${l}</button>`).join("")}</div>
    <p><b>촬영 각도</b></p><div class="chips">${VIEWS.map(([k, l]) => `<button class="chip ${state.viewAngle === k ? "on" : ""}" data-view="${k}">${l}</button>`).join("")}</div>
    <div class="chips"><button class="chip ${cam ? "" : "on"}" data-mode="upload">영상 업로드</button><button class="chip ${cam ? "on" : ""}" data-mode="camera">카메라 촬영</button></div>
    <label class="row"><input type="checkbox" id="consent" ${state.consent ? "checked" : ""}> 민감 건강정보 처리에 동의합니다</label>
    ${state.errors.map((e) => `<div class="err">${esc(e)}</div>`).join("")}
    ${cam ? `
      <video id="cam" playsinline muted hidden></video>
      <canvas id="view" class="view"></canvas>
      <div id="recInfo" class="muted">${state.recording ? `촬영 중… ${state.recSec}초 (10~30초)` : "카메라를 켜면 골격과 각도가 실시간으로 보여요."}</div>
      ${state.cam ? (state.recording
        ? `<button class="btn" id="recStop" ${state.recSec < 10 ? "disabled" : ""}>촬영 완료 · 분석</button>`
        : `<button class="btn" id="recStart">촬영 시작</button>`)
        : `<button class="btn" id="camOn">카메라 켜기</button>`}`
    : `
      <input type="file" id="file" accept="video/*" ${state.busy ? "disabled" : ""}>
      <canvas id="view" class="view" ${state.busy ? "" : "hidden"}></canvas>
      ${state.busy ? `<button class="chip" id="cancel">분석 중단</button><progress max="1" value="${state.progress}"></progress><div class="muted">분석 중… ${Math.round(state.progress * 100)}%</div>` : ""}
      <div class="muted">MP4/MOV/WebM · 10~30초 · 100MB 이하</div>`}
  </div>
  <button class="btn ghost" id="toSurvey">← 설문 수정</button>
  <div class="card"><b>샘플로 먼저 체험</b><p class="muted">영상 없이 앱 흐름만 볼 수 있어요(가상 데이터).</p>
    <div class="chips">${Object.entries(SAMPLES).map(([k, s]) => `<button class="chip" data-sample="${k}">${s.label}</button>`).join("")}</div></div>`;
}

const FIELD_LABEL = [["riskLevel", "위험도 등급"], ["bodyRegion", "부담 부위"], ["taskType", "작업 종류"], ["changeVsPrevious", "이전 대비 변화"], ["painScore", "통증 정도"]];
const gradeBar = (v) => `<div class="bar"><i class="${v >= 70 ? "h" : v >= 30 ? "m" : ""}" style="width:${v}%"></i></div>`;
const fmtDeg = (v) => (v == null ? "-" : `${v}°`);

function viewResult() {
  const a = state.analysis, j = state.judged, r = a.riskMetrics, b = a.bodyMetrics, rom = a.rom, q = a.quality;
  const lvl = { low: "낮음", medium: "주의", high: "높음" }[j.level];
  return `
  ${a.sample ? `<div class="info">샘플(가상) 데이터예요. 비교 시연용으로만 저장돼요.</div>` : ""}
  ${q.lowConfidence ? `<div class="alert">신뢰도 ${Math.round(q.confidence * 100)}%로 낮아요. 옆모습 전체가 보이게 다시 촬영해 주세요.</div>` : ""}
  <div class="card"><span class="badge ${j.level}">종합 위험도 ${lvl}</span>
    <h2>${esc(j.headline)}</h2>
    ${j.redFlags.length ? `<div class="alert">위험 신호: ${j.redFlags.map(esc).join(", ")} — 가까운 병원 진료를 권해요.</div>` : ""}
    ${j.hasSurvey ? `<div class="info">자가 설문: ${state.survey.regions.map((k) => REGIONS.find((x) => x[0] === k)?.[1]).join("·")} · 통증 ${j.pain}/10 · ${ONSETS.find((x) => x[0] === state.survey.onset)?.[1] ?? ""}</div>` : ""}
    ${j.findings.length ? `<b>의심 소견</b><ul>${j.findings.map((f) => `<li>${esc(f.label)} 영상 ${f.ratio}% — ${esc(f.text)}${f.matched ? ` <span class="badge high">설문과 일치</span>` : ""}</li>`).join("")}</ul>` : ""}
    ${j.reported.length ? `<div class="muted">설문에서 ${j.reported.join("·")} 불편을 선택했지만 영상에서는 뚜렷한 부담 자세가 보이지 않았어요. 작업 외 원인일 수 있어요.</div>` : ""}
    <div class="muted">확정 진단이 아니라 영상 기반 참고 정보예요. 정확한 판단은 의료진에게 받으세요. (분석 신뢰도 ${Math.round(q.confidence * 100)}%, 유효 ${q.validFrames}/${q.totalFrames}프레임)</div></div>
  <div class="card"><b>관절 각도 · ROM (최소~최대)</b>
    <table class="rt"><tr><th>부위</th><th>평균</th><th>최소</th><th>최대</th><th>ROM</th></tr>
      <tr><td>몸통 굴곡</td><td>${fmtDeg(b.trunkFlexionDeg)}</td><td>${fmtDeg(rom.trunk.min)}</td><td>${fmtDeg(rom.trunk.max)}</td><td><b>${fmtDeg(rom.trunk.rom)}</b></td></tr>
      <tr><td>목 굴곡</td><td>${fmtDeg(b.neckFlexionDeg)}</td><td>${fmtDeg(rom.neck.min)}</td><td>${fmtDeg(rom.neck.max)}</td><td><b>${fmtDeg(rom.neck.rom)}</b></td></tr>
      <tr><td>팔 올림</td><td>${fmtDeg(Math.max(b.leftArmElevationDeg ?? 0, b.rightArmElevationDeg ?? 0))}</td><td>${fmtDeg(rom.armElevation.min)}</td><td>${fmtDeg(rom.armElevation.max)}</td><td><b>${fmtDeg(rom.armElevation.rom)}</b></td></tr>
      <tr><td>팔꿈치</td><td>${fmtDeg(b.elbowAngleDeg)}</td><td>${fmtDeg(rom.elbow.min)}</td><td>${fmtDeg(rom.elbow.max)}</td><td><b>${fmtDeg(rom.elbow.rom)}</b></td></tr></table>
    <div class="muted">2D 단일 카메라, 보이는 한쪽 기준 추정값이에요.</div></div>
  <div class="card"><b>부위별 부담 자세 비율</b>
    ${["waist", "shoulder", "neck"].map((k) => `<div>${REGION_LABEL[k]} ${r.regionRiskRatios[k]}% <span class="muted">(주의 ${THRESHOLDS[k].caution}°↑ / 위험 ${THRESHOLDS[k].high}°↑)</span>${gradeBar(r.regionRiskRatios[k])}</div>`).join("")}
    <div class="muted">시간 흐름 (허리)</div><div class="tl">${a.timeline.map((t) => `<i class="${t.valid ? "g" + t.waist : "x"}"></i>`).join("")}</div></div>
  ${viewComparison()}
  ${j.referral ? `<button class="btn" id="toHosp">${esc(j.recommendedDepartment)} 병원 연계하기</button>` : `<button class="btn sec" id="toHosp">그래도 병원 알아보기 (선택)</button>`}
  <div class="card"><b>어떻게 할까요? (본인이 선택해요)</b>
    <div class="chips"><button class="chip ${state.choice === "self" ? "on" : ""}" data-choice="self">자가 관리 계속하기</button><button class="chip ${state.choice === "none" ? "on" : ""}" data-choice="none">지금은 안 함</button><button class="chip" data-choice="hospital">병원 연계하기</button></div>
    ${state.choice === "self" || state.choice === "none" ? `<div class="info">알겠어요. 아무것도 병원에 전송되지 않았어요. 작업 전후 1분 스트레칭을 권해요. <b>2주 뒤 같은 작업·각도로 다시 촬영</b>해 비교해 보세요(알림은 예시).</div>` : ""}</div>
  <div class="card"><b>지금 몸 상태 (0~10)</b><div class="scale">${Array.from({ length: 11 }, (_, i) => `<button class="chip ${state.rePain === i ? "on" : ""}" data-repain="${i}">${i}</button>`).join("")}</div>
    ${state.rePain !== null ? `<div class="muted">${state.rePain >= 7 ? "불편이 커요. 병원 연계를 선택할 수 있어요." : "기록했어요. 변화가 있으면 다시 알려주세요."}</div>` : ""}</div>
  <button class="btn ghost" id="again">다시 촬영해 비교하기</button>`;
}

function viewComparison() {
  const c = state.comparison;
  if (!c) return `<div class="card"><b>이전 결과와 비교</b><div class="muted">첫 분석이에요. 다음 분석부터 지난번과 비교해 드려요(같은 작업·같은 각도).</div></div>`;
  const cls = { improved: "info", stable: "info", worsened: "alert", not_comparable: "info" }[c.status];
  const lbl = { improved: "개선", stable: "유지", worsened: "악화", not_comparable: "비교 불가" }[c.status];
  return `<div class="card"><b>이전 결과와 비교</b> <span class="badge sim">${lbl}</span><div class="${cls}">${esc(c.comment)}</div>${c.comparable ? `<div class="muted">변화(%p): ${Object.entries(c.deltaPercentagePoint).map(([k, v]) => `${REGION_LABEL[k]} ${v > 0 ? "+" : ""}${v}`).join(" · ")}</div>` : ""}</div>`;
}

function viewHospital() {
  const j = state.judged;
  const list = filterAndSortHospitals(HOSPITALS, state.filters, state.sort, { recommendedDepartment: j.recommendedDepartment, preferences: state.filters });
  return `
  <div class="card"><b>추천 진료과: ${esc(j.recommendedDepartment)}</b><div class="muted">병원 전송은 항상 본인이 선택해요. 병원 정보는 예시예요.</div>
    <div class="chips">${[["night", "야간"], ["weekend", "주말"], ["english", "외국어"]].map(([k, l]) => `<button class="chip ${state.filters[k] ? "on" : ""}" data-filter="${k}">${l}</button>`).join("")}</div>
    <select id="sort">${[["recommend", "추천순"], ["distance", "거리순"], ["popular", "인기순"]].map(([v, l]) => `<option value="${v}" ${state.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <div class="muted">${SORT_EXPLAIN[state.sort]}</div></div>
  ${list.map((h) => `<div class="card hosp"><div><b>${esc(h.name)}</b><div class="muted">${h.department} · ${h.region} · ${h.distanceKm}km${h.night ? " · 야간" : ""}${h.weekend ? " · 주말" : ""}${h.english ? " · 외국어" : ""}</div></div>
    <button class="chip" data-send="${h.id}">요약 보내기</button></div>`).join("") || `<div class="info">조건에 맞는 병원이 없어요.</div>`}
  <button class="btn ghost" id="back">결과로 돌아가기</button>`;
}

function openSummary(hid) {
  const h = HOSPITALS.find((x) => x.id === hid), a = state.analysis;
  const record = { analysis: a, level: state.judged.level, regions: [...new Set([...state.judged.findings.map((f) => f.label), ...state.survey.regions.map((k) => REGIONS.find((x) => x[0] === k)?.[1])])], taskType: state.taskType, painScore: state.survey.pain };
  const fields = ["riskLevel", "bodyRegion", "taskType", "painScore", "changeVsPrevious"];
  const summary = buildSummary(record, state.comparison, fields);
  const m = $("#modal"); m.hidden = false;
  m.innerHTML = `<div><h3>${esc(h.name)}에 보낼 요약</h3>
    <div class="muted">보낼 항목을 직접 고르세요</div>
    <div class="chips">${FIELD_LABEL.map(([k, l]) => `<label class="chip"><input type="checkbox" data-field="${k}" checked> ${l}</label>`).join("")}</div>
    <pre class="pre" id="sumPre">${esc(JSON.stringify(summary, null, 2))}</pre>
    <div class="info">영상·프레임은 포함되지 않아요. 지금은 시뮬레이션이라 실제로 전송되지 않아요.</div>
    <button class="btn" id="ok">내가 확인했고, 보냅니다</button><button class="btn ghost" id="no">취소</button></div>`;
  const chosen = () => [...m.querySelectorAll("[data-field]")].filter((x) => x.checked).map((x) => x.dataset.field);
  m.querySelectorAll("[data-field]").forEach((x) => (x.onchange = () => { $("#sumPre").textContent = JSON.stringify(buildSummary(record, state.comparison, chosen()), null, 2); }));
  $("#no").onclick = () => (m.hidden = true);
  $("#ok").onclick = () => {
    const summary = buildSummary(record, state.comparison, chosen());
    const res = simulateSubmit(buildPayload({ assessmentId: a.assessmentId, hospitalId: hid, summary, userClicked: true }));
    m.innerHTML = `<div><h3>${res.status === 200 ? "전송 시뮬레이션 완료" : "전송 실패"}</h3>
      <p><span class="badge sim">SIMULATED</span> 실제 병원으로 전송되지 않았어요.</p><button class="btn" id="done">닫기</button></div>`;
    $("#done").onclick = () => (m.hidden = true);
  };
}

async function onFile(e) {
  const file = e.target.files[0]; if (!file) return;
  state.errors = [];
  let duration = 0;
  try { duration = await readVideoDuration(file); } catch (err) { state.errors = [err.message]; return render(); }
  const v = validateVideoMeta({ type: file.type, size: file.size, duration }, state.consent);
  if (!v.valid) { state.errors = v.errors; return render(); }
  state.busy = true; state.progress = 0; render();
  try {
    abort = new AbortController();
    const a = await analyzeVideo(file, { signal: abort.signal, canvas: $("#view"), onProgress: (p) => { state.progress = p; const el = document.querySelector("progress"); if (el) el.value = p; } });
    state.busy = false; finish(a);
  } catch (err) { state.busy = false; state.errors = [err.name === "AbortError" ? "분석을 중단했어요. 다시 시도할 수 있어요." : err.message]; render(); }
}

function bind() {
  const tog = (arr, k) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  document.querySelectorAll("[data-sreg]").forEach((b) => (b.onclick = () => { state.survey.regions = tog(state.survey.regions, b.dataset.sreg); render(); }));
  document.querySelectorAll("[data-swarn]").forEach((b) => (b.onclick = () => { state.survey.warnings = tog(state.survey.warnings, b.dataset.swarn); render(); }));
  document.querySelectorAll("[data-spain]").forEach((b) => (b.onclick = () => { state.survey.pain = Number(b.dataset.spain); render(); }));
  const single = (attr, key) => document.querySelectorAll(`[data-${attr}]`).forEach((b) => (b.onclick = () => { const v = b.dataset[attr]; state.survey[key] = state.survey[key] === v ? null : v; render(); }));
  single("sfreq", "frequency"); single("simp", "impact"); single("streat", "treatment");
  document.querySelectorAll("[data-task]").forEach((b) => (b.onclick = () => { state.taskType = b.dataset.task; render(); }));
  document.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { state.viewAngle = b.dataset.view; render(); }));
  document.querySelectorAll("[data-repain]").forEach((b) => (b.onclick = () => { state.rePain = Number(b.dataset.repain); render(); }));
  document.querySelectorAll("[data-choice]").forEach((b) => (b.onclick = () => { state.choice = b.dataset.choice; if (b.dataset.choice === "hospital") go("hospital"); else render(); }));
  document.querySelectorAll("[data-sonset]").forEach((b) => (b.onclick = () => { state.survey.onset = b.dataset.sonset; render(); }));
  const sn = $("#surveyNext");
  if (sn) sn.onclick = () => { const v = validateQuestionnaire(readQuestionnaire(state.survey)); state.surveyErr = v.errors; if (v.valid) go("upload"); else render(); };
  const cn = $("#cancel"); if (cn) cn.onclick = () => abort?.abort();
  const rl = $("#reload"); if (rl) rl.onclick = () => location.reload();
  const ts = $("#toSurvey"); if (ts) ts.onclick = () => go("survey");
  const authGo = $("#authGo");
  if (authGo) {
    const submit = async () => {
      const id = $("#uid").value.trim(), pin = $("#pin").value, users = readUsers();
      if (!/^[A-Za-z0-9]{3,}$/.test(id) || pin.length < 4) { state.loginErr = "아이디(영문/숫자 3자↑)와 비밀번호(4자↑)를 확인해 주세요."; return render(); }
      const h = await hashPin(id, pin);
      if (state.signup) {
        if (users[id]) { state.loginErr = "이미 있는 아이디예요."; return render(); }
        users[id] = h; localStorage.setItem(USERS, JSON.stringify(users));
      } else if (users[id] !== h) { state.loginErr = "아이디 또는 비밀번호가 맞지 않아요."; return render(); }
      localStorage.setItem(SESSION, id); state.user = id; state.loginErr = ""; go("survey");
    };
    authGo.onclick = submit;
    $("#pin").onkeydown = (e) => { if (e.key === "Enter") submit(); };
    $("#authSwitch").onclick = () => { state.signup = !state.signup; state.loginErr = ""; render(); };
    $("#guest").onclick = () => { state.user = "게스트"; go("survey"); };
  }
  document.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = async () => { await stopCam(); state.mode = b.dataset.mode; state.errors = []; render(); }));
  const consent = $("#consent"); if (consent) consent.onchange = () => (state.consent = consent.checked);
  const file = $("#file"); if (file) file.onchange = onFile;
  document.querySelectorAll("[data-sample]").forEach((b) => (b.onclick = () => finish(analyzeFrames(SAMPLES[b.dataset.sample].frames(), { sample: true }))));
  const camOn = $("#camOn");
  if (camOn) camOn.onclick = async () => {
    if (!state.consent) { state.errors = ["민감 건강정보 처리에 동의해 주세요."]; return render(); }
    state.errors = [];
    try { state.cam = await startCamera($("#cam"), $("#view")); render(); }
    catch (err) { state.errors = [err.message || "카메라를 사용할 수 없어요."]; render(); }
  };
  const recStart = $("#recStart");
  if (recStart) recStart.onclick = () => {
    state.cam.startRecording(); state.recording = true; state.recSec = 0; render();
    timer = setInterval(() => {
      state.recSec++;
      const info = $("#recInfo"); if (info) info.textContent = `촬영 중… ${state.recSec}초 (10~30초)`;
      const stop = $("#recStop"); if (stop && state.recSec >= 10) stop.disabled = false;
      if (state.recSec >= 30) stop?.click();
    }, 1000);
  };
  const recStop = $("#recStop");
  if (recStop) recStop.onclick = async () => {
    const a = state.cam.finishRecording(); await stopCam(); finish(a);
  };
  const toHosp = $("#toHosp"); if (toHosp) toHosp.onclick = () => go("hospital");
  const again = $("#again"); if (again) again.onclick = () => { state.errors = []; go("upload"); };
  const back = $("#back"); if (back) back.onclick = () => go("result");
  document.querySelectorAll("[data-filter]").forEach((b) => (b.onclick = () => { state.filters[b.dataset.filter] = !state.filters[b.dataset.filter]; render(); }));
  const sort = $("#sort"); if (sort) sort.onchange = () => { state.sort = sort.value; render(); };
  document.querySelectorAll("[data-send]").forEach((b) => (b.onclick = () => openSummary(b.dataset.send)));
}

render();


