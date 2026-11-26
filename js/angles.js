// 2D 관절각 계산 (TRD 5.2). MediaPipe Pose 33 landmarks 인덱스 사용.
export const LM = { EAR_L: 7, EAR_R: 8, SH_L: 11, SH_R: 12, EL_L: 13, EL_R: 14, WR_L: 15, WR_R: 16, HIP_L: 23, HIP_R: 24 };
export const CORE_VISIBILITY = 0.6;

const deg = (r) => (r * 180) / Math.PI;

// 3점 각도: arccos((BA·BC)/(|BA||BC|)), B가 꼭짓점
export function angleAt(a, b, c) {
  const ba = [a.x - b.x, a.y - b.y];
  const bc = [c.x - b.x, c.y - b.y];
  const n = Math.hypot(...ba) * Math.hypot(...bc);
  if (n === 0) return NaN;
  const cos = Math.max(-1, Math.min(1, (ba[0] * bc[0] + ba[1] * bc[1]) / n));
  return deg(Math.acos(cos));
}

// 벡터(from→to)가 기준 방향과 이루는 각도
function tilt(from, to, ref) {
  const v = [to.x - from.x, to.y - from.y];
  const n = Math.hypot(...v);
  if (n === 0) return NaN;
  const cos = Math.max(-1, Math.min(1, (v[0] * ref[0] + v[1] * ref[1]) / n));
  return deg(Math.acos(cos));
}

const UP = [0, -1];
const DOWN = [0, 1];

export function pickSide(lm) {
  const vis = (idx) => idx.reduce((s, i) => s + (lm[i]?.visibility ?? 0), 0);
  const left = vis([LM.EAR_L, LM.SH_L, LM.EL_L, LM.HIP_L]);
  const right = vis([LM.EAR_R, LM.SH_R, LM.EL_R, LM.HIP_R]);
  return left >= right ? "L" : "R";
}

export function isValidFrame(lm, side = pickSide(lm)) {
  if (!lm || lm.length < 33) return false;
  const s = side === "L" ? [LM.EAR_L, LM.SH_L, LM.EL_L, LM.HIP_L] : [LM.EAR_R, LM.SH_R, LM.EL_R, LM.HIP_R];
  return s.every((i) => (lm[i]?.visibility ?? 0) >= CORE_VISIBILITY);
}

// 보이는 한쪽 기준 단일측 측정
export function calculateJointAngles(lm) {
  const side = pickSide(lm);
  const k = side === "L"
    ? { ear: LM.EAR_L, sh: LM.SH_L, el: LM.EL_L, wr: LM.WR_L, hip: LM.HIP_L }
    : { ear: LM.EAR_R, sh: LM.SH_R, el: LM.EL_R, wr: LM.WR_R, hip: LM.HIP_R };
  return {
    side,
    trunkFlexionDeg: tilt(lm[k.hip], lm[k.sh], UP),
    neckFlexionDeg: tilt(lm[k.sh], lm[k.ear], UP),
    armElevationDeg: tilt(lm[k.sh], lm[k.el], DOWN),
    elbowAngleDeg: angleAt(lm[k.sh], lm[k.el], lm[k.wr]),
  };
}
