// 자가 설문(PRD 7문항): 불편 부위 · 통증 · 시작시기 · 빈도 · 일상 영향 · 진료이력 · 주의신호. 진단/점수 판정은 하지 않는다.
export const REGIONS = [["neck", "목"], ["shoulder", "어깨"], ["elbow", "팔꿈치"], ["wrist", "손목·손"], ["waist", "허리"], ["knee", "무릎"], ["foot", "발"]];
export const ONSETS = [["lt1w", "1주 미만"], ["lt1m", "1개월 미만"], ["lt3m", "3개월 미만"], ["gt3m", "3개월 이상"]];
export const FREQUENCIES = [["sometimes", "가끔"], ["often", "자주"], ["daily", "거의 매일"]];
export const IMPACTS = [["none", "거의 없음"], ["work", "일하기 힘듦"], ["sleep", "잠·일상이 힘듦"]];
export const TREATMENTS = [["none", "없음"], ["ongoing", "치료 중"], ["done", "치료 후 재발"]];
export const WARNINGS = [
  ["numbness", "저림·감각 이상"], ["weakness", "힘 빠짐"], ["nightPain", "밤에 아파서 깸"], ["injury", "다친 뒤 심한 통증"], ["fever", "발열 동반"],
];
export const TASKS = [["welding", "용접"], ["fitting", "취부·조립"], ["piping", "배관"], ["painting", "도장"], ["outfitting", "의장"], ["etc", "기타"]];
export const VIEWS = [["side", "옆모습(측면)"], ["diag45", "45° 비스듬히"]];

export function readQuestionnaire(raw = {}) {
  return {
    regions: [...(raw.regions ?? [])],
    pain: raw.pain === undefined || raw.pain === null || raw.pain === "" ? null : Number(raw.pain),
    onset: raw.onset ?? null,
    frequency: raw.frequency ?? null,
    impact: raw.impact ?? null,
    treatment: raw.treatment ?? null,
    warnings: [...(raw.warnings ?? [])],
  };
}

export function validateQuestionnaire(q) {
  const errors = [];
  if (!q.regions.length) errors.push("불편한 부위를 1개 이상 선택해 주세요.");
  if (!Number.isInteger(q.pain) || q.pain < 0 || q.pain > 10) errors.push("통증 정도(0~10)를 선택해 주세요.");
  if (!q.onset) errors.push("언제부터 불편한지 선택해 주세요.");
  if (!q.frequency) errors.push("얼마나 자주 불편한지 선택해 주세요.");
  if (!q.treatment) errors.push("진료 이력을 선택해 주세요.");
  return { valid: errors.length === 0, errors };
}

export const hasWarningSign = (q) => q.warnings.length > 0;
export const needsEmergency = (q) => q.warnings.includes("injury") || (q.warnings.includes("numbness") && q.warnings.includes("weakness"));