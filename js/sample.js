// 데모용 샘플 좌표 (영상 없이 분석 경로 시연). 합성 데이터이며 실제 측정이 아님.
export function frame(trunk, neck, arm, vis = 0.9) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));
  const r = (d) => (d * Math.PI) / 180;
  const hip = { x: 0.5, y: 0.8 };
  const sh = { x: hip.x + 0.3 * Math.sin(r(trunk)), y: hip.y - 0.3 * Math.cos(r(trunk)) };
  const ear = { x: sh.x + 0.12 * Math.sin(r(neck)), y: sh.y - 0.12 * Math.cos(r(neck)) };
  const el = { x: sh.x + 0.18 * Math.sin(r(arm)), y: sh.y + 0.18 * Math.cos(r(arm)) };
  const wr = { x: el.x + 0.16 * Math.sin(r(arm + 60)), y: el.y + 0.16 * Math.cos(r(arm + 60)) };
  for (const [i, p] of [[7, ear], [8, ear], [11, sh], [12, sh], [13, el], [14, el], [15, wr], [16, wr], [23, hip], [24, hip]]) {
    lm[i] = { ...p, z: 0, visibility: vis };
  }
  return lm;
}

function series(n, f, lowVisEvery = 0) {
  return Array.from({ length: n }, (_, i) => {
    const [t, ne, a] = f(i);
    return frame(t, ne, a, lowVisEvery && i % lowVisEvery === 0 ? 0.3 : 0.9);
  });
}

export const SAMPLES = {
  waist: { label: "허리 부담 샘플", frames: () => series(30, (i) => [30 + (i % 10) * 6, 15, 20 + (i % 5) * 5], 10) },
  shoulder: { label: "어깨 부담 샘플", frames: () => series(30, (i) => [10 + (i % 4) * 3, 12, 60 + (i % 6) * 8], 10) },
  neck: { label: "목 부담 샘플", frames: () => series(30, (i) => [12, 25 + (i % 8) * 4, 20], 10) },
};
