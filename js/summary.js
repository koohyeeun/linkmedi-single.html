// 요약 생성 및 전송 시뮬레이션 (TRD 5.5, A.3). 영상/프레임은 절대 포함하지 않는다.
const FORBIDDEN = /video|frame|blob|image|file/i;
export const ALLOWED_FIELDS = ["riskLevel", "bodyRegion", "taskType", "painScore", "changeVsPrevious"];

function hasForbiddenKey(obj) {
  if (obj && typeof obj === "object") {
    return Object.keys(obj).some((k) => (k !== "videoIncluded" && FORBIDDEN.test(k)) || hasForbiddenKey(obj[k]));
  }
  return false;
}

export function buildSummary(record, comparison, selectedFields) {
  const full = {
    riskLevel: record.level ?? record.analysis.riskMetrics.overallLevel,
    bodyRegion: record.regions,
    taskType: record.taskType,
    painScore: record.painScore,
    changeVsPrevious: comparison?.comparable ? { status: comparison.status, delta: comparison.deltaPercentagePoint } : null,
  };
  const summary = {};
  for (const f of selectedFields) {
    if (!ALLOWED_FIELDS.includes(f)) throw new Error(`허용되지 않은 필드: ${f}`);
    summary[f] = full[f];
  }
  return summary;
}

export function buildPayload({ assessmentId, hospitalId, summary, userClicked }) {
  return {
    assessmentId, hospitalId, selectedFields: Object.keys(summary), summary,
    videoIncluded: false, userClicked: !!userClicked,
    deliveryMode: "simulation", status: "SIMULATED",
  };
}

// 네트워크 호출 없음. 규칙 위반 시 400 모사.
export function simulateSubmit(payload) {
  if (payload.userClicked !== true) return { status: 400, error: "USER_CLICK_REQUIRED" };
  if (payload.videoIncluded !== false || hasForbiddenKey(payload)) return { status: 400, error: "VIDEO_OR_FRAME_NOT_ALLOWED" };
  return { status: 200, result: "SIMULATED", payload };
}
