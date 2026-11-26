// 프레임 목록 → AnalysisResult (TRD 5.2, 5.3, A.1). 순수 함수.
import { calculateJointAngles, isValidFrame } from "./angles.js";

export const RULE_VERSION = "prototype-0.1";
export const MIN_CONFIDENCE = 0.6;

// 임계값: 허리·어깨는 TRD 명시, 목은 가정값(README 명시)
export const THRESHOLDS = {
  waist: { caution: 20, high: 60 },
  shoulder: { caution: 45, high: 90 },
  neck: { caution: 20, high: 45 },
};

export const REGION_LABEL = { waist: "허리", shoulder: "어깨", neck: "목" };

export function gradeOf(region, deg) {
  const t = THRESHOLDS[region];
  if (!(deg > t.caution)) return 0;
  return deg > t.high ? 2 : 1;
}

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export function overallLevel(ratios, highRatios) {
  const worst = Math.max(ratios.waist, ratios.shoulder, ratios.neck);
  const worstHigh = Math.max(highRatios.waist, highRatios.shoulder, highRatios.neck);
  if (worstHigh >= 20 || worst >= 70) return "high";
  if (worst >= 30) return "medium";
  return "low";
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

export function kstIso(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().replace("Z", "+09:00").replace(/\.\d{3}/, "");
}

export function analyzeFrames(frames, { sample = false } = {}) {
  const total = frames.length;
  const rows = frames.map((lm) => (lm && isValidFrame(lm) ? calculateJointAngles(lm) : null));
  const valid = rows.filter(Boolean);
  const confidence = total ? valid.length / total : 0;

  const cnt = { waist: 0, shoulder: 0, neck: 0 };
  const hi = { waist: 0, shoulder: 0, neck: 0 };
  const timeline = rows.map((r) => {
    if (!r) return { valid: false, waist: 0, shoulder: 0, neck: 0 };
    const g = {
      waist: gradeOf("waist", r.trunkFlexionDeg),
      shoulder: gradeOf("shoulder", r.armElevationDeg),
      neck: gradeOf("neck", r.neckFlexionDeg),
    };
    for (const k of Object.keys(g)) { if (g[k] >= 1) cnt[k]++; if (g[k] === 2) hi[k]++; }
    return { valid: true, ...g };
  });
  const pct = (o) => ({
    waist: round(valid.length ? (o.waist / valid.length) * 100 : 0),
    shoulder: round(valid.length ? (o.shoulder / valid.length) * 100 : 0),
    neck: round(valid.length ? (o.neck / valid.length) * 100 : 0),
  });
  const ratios = pct(cnt);
  const highRatios = pct(hi);
  const m = (f) => round(mean(valid.map(f)));
  const romOf = (f) => {
    const v = valid.map(f).filter(Number.isFinite);
    if (!v.length) return { min: null, max: null, rom: null };
    const min = Math.min(...v), max = Math.max(...v);
    return { min: round(min), max: round(max), rom: round(max - min) };
  };
  const sideArm = (s) => { const a = valid.filter((r) => r.side === s); return a.length ? round(mean(a.map((r) => r.armElevationDeg))) : null; };

  return {
    assessmentId: uuid(),
    createdAt: kstIso(),
    scoreType: "prototype_index",
    sample,
    bodyMetrics: {
      trunkFlexionDeg: m((r) => r.trunkFlexionDeg),
      neckFlexionDeg: m((r) => r.neckFlexionDeg),
      leftArmElevationDeg: sideArm("L"),
      rightArmElevationDeg: sideArm("R"),
      elbowAngleDeg: m((r) => r.elbowAngleDeg),
    },
    rom: {
      trunk: romOf((r) => r.trunkFlexionDeg),
      neck: romOf((r) => r.neckFlexionDeg),
      armElevation: romOf((r) => r.armElevationDeg),
      elbow: romOf((r) => r.elbowAngleDeg),
    },
    riskMetrics: { regionRiskRatios: ratios, highRatios, overallLevel: overallLevel(ratios, highRatios) },
    quality: {
      totalFrames: total,
      validFrames: valid.length,
      excludedFrames: total - valid.length,
      confidence: round(confidence, 2),
      lowConfidence: confidence < MIN_CONFIDENCE,
    },
    timeline,
    ruleVersion: RULE_VERSION,
    limitations: ["2D single-camera estimate", "Not a medical diagnosis"],
  };
}
