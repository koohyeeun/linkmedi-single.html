import assert from "node:assert/strict";
import { angleAt, calculateJointAngles } from "../js/angles.js";
import { analyzeFrames, gradeOf } from "../js/analysis.js";
import { compareResults, statusOf } from "../js/compare.js";
import { HOSPITALS, filterAndSortHospitals } from "../js/hospitals.js";
import { buildSummary, buildPayload, simulateSubmit } from "../js/summary.js";
import { readQuestionnaire, validateQuestionnaire, needsEmergency } from "../js/questionnaire.js";
import { validateVideoMeta } from "../js/videoValidator.js";
import { frame, SAMPLES } from "../js/sample.js";
import { judge } from "../js/findings.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const rec = (ratios, o = {}) => ({
  id: "x", taskType: "welding", viewAngle: "side",
  analysis: { quality: { confidence: 0.9 }, riskMetrics: { regionRiskRatios: ratios, overallLevel: "medium" } }, ...o,
});

t("angleAt 90도", () => assert.ok(Math.abs(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }) - 90) < 1e-9));
t("trunk/neck/arm 각도 복원", () => {
  const a = calculateJointAngles(frame(40, 25, 70));
  assert.ok(Math.abs(a.trunkFlexionDeg - 40) < 0.1);
  assert.ok(Math.abs(a.armElevationDeg - 70) < 0.1);
});
t("임계값 경계", () => {
  assert.equal(gradeOf("waist", 20), 0); assert.equal(gradeOf("waist", 21), 1);
  assert.equal(gradeOf("waist", 60), 1); assert.equal(gradeOf("waist", 61), 2);
  assert.equal(gradeOf("shoulder", 90), 1); assert.equal(gradeOf("shoulder", 91), 2);
});
t("compare 경계 Δ=-10/0/+10", () => {
  assert.equal(statusOf(-10), "improved"); assert.equal(statusOf(0), "stable"); assert.equal(statusOf(10), "worsened");
  assert.equal(statusOf(-9.9), "stable"); assert.equal(statusOf(9.9), "stable");
});
t("compare 개선 + 남은 위험 코멘트", () => {
  const r = compareResults(rec({ waist: 60, shoulder: 50, neck: 0 }), rec({ waist: 30, shoulder: 50, neck: 0 }));
  assert.equal(r.status, "improved"); assert.equal(r.commentTemplateId, "WAIST_IMPROVED_SHOULDER_REMAINS");
});
t("compare 비교 불가 3종", () => {
  const b = rec({ waist: 50, shoulder: 0, neck: 0 });
  assert.equal(compareResults(b, rec({ waist: 0, shoulder: 0, neck: 0 }, { viewAngle: "front" })).reason, "VIEW_ANGLE_MISMATCH");
  assert.equal(compareResults(b, rec({ waist: 0, shoulder: 0, neck: 0 }, { taskType: "piping" })).reason, "TASK_TYPE_MISMATCH");
  const low = rec({ waist: 0, shoulder: 0, neck: 0 }); low.analysis.quality.confidence = 0.5;
  assert.equal(compareResults(b, low).reason, "LOW_CONFIDENCE");
  assert.equal(compareResults(null, b).comparable, false);
});
t("샘플 분석: 신뢰도·부위", () => {
  const w = analyzeFrames(SAMPLES.waist.frames(), { sample: true });
  assert.ok(w.quality.confidence >= 0.6 && !w.quality.lowConfidence);
  assert.ok(w.riskMetrics.regionRiskRatios.waist > 50);
  assert.equal(w.scoreType, "prototype_index");
});
t("판정: 허리 부담 → 정형외과 권고", () => {
  const v = judge(analyzeFrames(SAMPLES.waist.frames(), { sample: true }));
  assert.ok(v.referral); assert.equal(v.findings[0].region, "waist"); assert.equal(v.recommendedDepartment, "정형외과");
  assert.equal(judge(analyzeFrames(Array.from({ length: 10 }, () => frame(5, 5, 5)))).referral, false);
});
t("ROM = 최대-최소", () => {
  const f = [frame(10, 10, 30), frame(50, 10, 30), frame(30, 10, 30)];
  const r = analyzeFrames(f).rom.trunk;
  assert.ok(Math.abs(r.min - 10) < 0.2 && Math.abs(r.max - 50) < 0.2 && Math.abs(r.rom - 40) < 0.3);
});
t("유효 프레임 60% 미만 → 신뢰도 낮음", () => {
  const f = Array.from({ length: 10 }, (_, i) => frame(30, 10, 30, i < 5 ? 0.3 : 0.9));
  assert.ok(analyzeFrames(f).quality.lowConfidence);
});
t("병원 필터/정렬", () => {
  assert.ok(filterAndSortHospitals(HOSPITALS, { night: true }).every((h) => h.night));
  const d = filterAndSortHospitals(HOSPITALS, {}, "distance");
  assert.equal(d[0].id, "h1");
  const r = filterAndSortHospitals(HOSPITALS, {}, "recommend", { recommendedDepartment: "재활의학과" });
  assert.equal(r[0].department, "재활의학과");
});
t("simulateSubmit: userClicked 필수 / 영상 거부", () => {
  const a = analyzeFrames(SAMPLES.neck.frames());
  const rc = { analysis: a, regions: ["neck"], taskType: "welding", painScore: 5 };
  const summary = buildSummary(rc, null, ["riskLevel", "bodyRegion"]);
  const p = buildPayload({ assessmentId: a.assessmentId, hospitalId: "h1", summary, userClicked: true });
  assert.equal(simulateSubmit(p).status, 200);
  assert.equal(simulateSubmit({ ...p, userClicked: false }).status, 400);
  assert.equal(simulateSubmit({ ...p, videoIncluded: true }).status, 400);
  assert.equal(simulateSubmit({ ...p, summary: { ...summary, videoBlob: 1 } }).status, 400);
  assert.throws(() => buildSummary(rc, null, ["video"]));
});
t("설문 검증", () => {
  assert.equal(validateQuestionnaire(readQuestionnaire({})).valid, false);
  assert.equal(validateQuestionnaire(readQuestionnaire({ regions: ["waist"], pain: 5, onset: "1m", frequency: "often", treatment: "none" })).valid, true);
});
t("설문+영상 통합 판정", () => {
  const a = analyzeFrames(SAMPLES.waist.frames(), { sample: true });
  const j = judge(a, readQuestionnaire({ regions: ["waist"], pain: 6, onset: "lt1m", warnings: [] }));
  assert.equal(j.matched.length, 1);
  assert.equal(j.level, "high");
  const ok = analyzeFrames(Array.from({ length: 10 }, () => frame(5, 5, 5)));
  assert.equal(judge(ok, readQuestionnaire({ regions: ["neck"], pain: 1, onset: "gt3m" })).referral, false);
  const rf = judge(ok, readQuestionnaire({ regions: ["neck"], pain: 1, onset: "gt3m", warnings: ["numbness"] }));
  assert.ok(rf.referral && rf.level === "high" && rf.redFlags.length === 1);
});
t("영상 검증", () => {
  const ok = { type: "video/mp4", size: 1e6, duration: 15 };
  assert.ok(validateVideoMeta(ok, true).valid);
  assert.ok(!validateVideoMeta(ok, false).valid);
  assert.ok(!validateVideoMeta({ ...ok, duration: 9 }, true).valid);
  assert.ok(!validateVideoMeta({ ...ok, duration: 31 }, true).valid);
  assert.ok(!validateVideoMeta({ ...ok, size: 101 * 1024 * 1024 }, true).valid);
  assert.ok(!validateVideoMeta({ ...ok, type: "image/png" }, true).valid);
});
t("설문 필수 누락 시 사유 반환", () => {
  const r = validateQuestionnaire(readQuestionnaire({ regions: ["waist"], pain: 11 }));
  assert.ok(!r.valid && r.errors.length >= 3);
});
t("응급 의심 안내 조건", () => {
  assert.ok(needsEmergency(readQuestionnaire({ warnings: ["injury"] })));
  assert.ok(!needsEmergency(readQuestionnaire({ warnings: ["fever"] })));
});
t("신뢰도 낮은 분석은 판정 보류(재촬영 안내)", () => {
  const f = Array.from({ length: 10 }, () => null);
  const a = analyzeFrames(f);
  assert.ok(a.quality.lowConfidence);
  assert.equal(judge(a).referral, false);
});
t("동의 없는 병원 전송 차단", () => {
  const a = analyzeFrames(SAMPLES.waist.frames(), { sample: true });
  const rc = { analysis: a, regions: ["waist"], taskType: "welding", painScore: 5 };
  const s = buildSummary(rc, null, ["riskLevel"]);
  assert.equal(simulateSubmit(buildPayload({ assessmentId: "x", hospitalId: "h1", summary: s, userClicked: false })).error, "USER_CLICK_REQUIRED");
  assert.equal(simulateSubmit(buildPayload({ assessmentId: "x", hospitalId: "h1", summary: s })).status, 400);
});
console.log(`\n${n} tests passed`);
