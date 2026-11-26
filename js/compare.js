// 이전 결과와 비교 (TRD 5.4). 규칙 기반 템플릿, LLM 미사용.
import { MIN_CONFIDENCE, REGION_LABEL } from "./analysis.js";

export const STABLE_BAND = 10; // %p

export function statusOf(delta) {
  if (delta <= -STABLE_BAND) return "improved";
  if (delta >= STABLE_BAND) return "worsened";
  return "stable";
}

// 기록: { id, taskType, viewAngle, analysis }
export function compareResults(base, cur) {
  const notComparable = (reason) => ({
    comparable: false, reason, baseId: base?.id ?? null,
    baseline: null, current: null, deltaPercentagePoint: null,
    status: "not_comparable", commentTemplateId: "NOT_COMPARABLE",
    comment: "촬영 각도가 달라 정확히 비교하기 어려워요. 같은 각도로 다시 찍어볼까요?",
  });
  if (!base) return notComparable("NO_BASELINE");
  if (base.taskType !== cur.taskType) return notComparable("TASK_TYPE_MISMATCH");
  if (base.viewAngle !== cur.viewAngle) return notComparable("VIEW_ANGLE_MISMATCH");
  if (base.analysis.quality.confidence < MIN_CONFIDENCE || cur.analysis.quality.confidence < MIN_CONFIDENCE) {
    return notComparable("LOW_CONFIDENCE");
  }
  const b = base.analysis.riskMetrics.regionRiskRatios;
  const c = cur.analysis.riskMetrics.regionRiskRatios;
  const delta = {};
  for (const k of Object.keys(REGION_LABEL)) delta[k] = Math.round((c[k] - b[k]) * 10) / 10;

  const main = Object.keys(delta).sort((x, y) => Math.abs(delta[y]) - Math.abs(delta[x]))[0];
  const status = statusOf(delta[main]);
  const remain = Object.keys(c).filter((k) => k !== main).sort((x, y) => c[y] - c[x])[0];
  const remainHigh = c[remain] >= 30;
  const id = `${main.toUpperCase()}_${status.toUpperCase()}` + (remainHigh ? `_${remain.toUpperCase()}_REMAINS` : "");

  const L = REGION_LABEL;
  let comment;
  if (status === "improved") {
    comment = `지난번보다 ${L[main]} 부담 구간이 줄었어요.` + (remainHigh ? ` ${L[remain]}은(는) 아직 높아요.` : "");
  } else if (status === "worsened") {
    comment = `이번엔 ${L[main]} 부담 구간이 늘었어요. 불편하면 병원 연계를 선택할 수 있어요.`;
  } else {
    comment = `${L[main]} 부담은 지난번과 비슷해요.` + (remainHigh ? ` ${L[remain]}은(는) 아직 높아요.` : "");
  }
  return {
    comparable: true, reason: null, baseId: base.id,
    baseline: { regionRiskRatio: b }, current: { regionRiskRatio: c },
    deltaPercentagePoint: delta, mainRegion: main,
    status, commentTemplateId: id, comment,
  };
}

export function getPreviousAssessment(list, { taskType } = {}) {
  const same = list.filter((a) => !taskType || a.taskType === taskType);
  return same.length ? same[same.length - 1] : null;
}
