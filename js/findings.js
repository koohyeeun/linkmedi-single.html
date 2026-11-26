// 영상 각도 분석 + 자가 설문 → 통합 판정(의심 소견) + 추천 진료과. 확정 진단이 아닌 참고 정보.
import { REGION_LABEL } from "./analysis.js";

const RULES = {
  waist: { finding: "허리를 과도하게 숙이는 자세가 반복돼요 (요추 부담 의심)", dept: "정형외과" },
  shoulder: { finding: "팔을 어깨 높이 위로 드는 자세가 많아요 (어깨 충돌·회전근개 부담 의심)", dept: "정형외과" },
  neck: { finding: "목을 앞으로 숙이는 자세가 많아요 (경추 부담 의심)", dept: "재활의학과" },
};
const CAUTION = 30;
const RANK = { low: 0, medium: 1, high: 2 };
const LEVELS = ["low", "medium", "high"];
export const WARNING_LABEL = { numbness: "저림·감각 이상", weakness: "힘 빠짐", nightPain: "밤에 아파서 깸", injury: "다친 뒤 심한 통증", fever: "발열 동반" };

export function judge(analysis, survey = null) {
  const ratios = analysis.riskMetrics.regionRiskRatios;
  const lowConf = analysis.quality.lowConfidence;
  const sRegions = survey?.regions ?? [];
  const pain = survey?.pain ?? 0;
  const redFlags = (survey?.warnings ?? []).map((w) => WARNING_LABEL[w] ?? w);

  const findings = Object.keys(REGION_LABEL)
    .filter((k) => ratios[k] >= CAUTION)
    .sort((a, b) => ratios[b] - ratios[a])
    .map((k) => ({ region: k, label: REGION_LABEL[k], ratio: ratios[k], text: RULES[k].finding, dept: RULES[k].dept,
      matched: sRegions.includes(k) && pain >= 4 }));
  const matched = findings.filter((f) => f.matched);
  const reported = sRegions.filter((k) => REGION_LABEL[k] && !findings.some((f) => f.region === k)).map((k) => REGION_LABEL[k]);

  const videoLevel = lowConf ? "low" : analysis.riskMetrics.overallLevel;
  const painLevel = pain >= 7 ? "high" : pain >= 4 ? "medium" : "low";
  let rank = Math.max(RANK[videoLevel], RANK[painLevel]);
  if (matched.length) rank = Math.min(2, rank + 1);
  if (redFlags.length) rank = 2;
  const level = LEVELS[rank];

  const referral = redFlags.length > 0 || pain >= 7 || (!lowConf && (videoLevel === "high" || (videoLevel === "medium" && findings.length > 0))) || (matched.length > 0 && pain >= 4);
  const dept = (matched[0] ?? findings[0])?.dept ?? (sRegions.includes("neck") ? "재활의학과" : "정형외과");

  const headline = redFlags.length ? "위험 신호가 있어 병원 상담을 권장해요"
    : lowConf && !survey ? "신뢰도가 낮아 판정할 수 없어요"
    : referral ? "병원 상담을 권장해요"
    : findings.length || pain >= 4 ? "자세 개선과 경과 관찰을 권장해요"
    : "뚜렷한 부담 자세는 발견되지 않았어요";
  return { findings, matched, reported, redFlags, level, referral, recommendedDepartment: dept, headline, pain, hasSurvey: !!survey };
}
