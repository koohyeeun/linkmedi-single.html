// 병원 필터/정렬 (TRD 5.5). 모든 데이터는 예시.
export const HOSPITALS = [
  { id: "h1", name: "거제 바른정형외과 (예시)", department: "정형외과", region: "고현동", night: false, weekend: true, english: false, distanceKm: 1.2, popularity: 82 },
  { id: "h2", name: "옥포 튼튼재활의학과 (예시)", department: "재활의학과", region: "옥포동", night: true, weekend: true, english: true, distanceKm: 6.5, popularity: 74 },
  { id: "h3", name: "거제 조선직업환경의학과 (예시)", department: "직업환경의학과", region: "아주동", night: false, weekend: false, english: true, distanceKm: 4.1, popularity: 65 },
  { id: "h4", name: "장승포 나은정형외과 (예시)", department: "정형외과", region: "장승포동", night: true, weekend: false, english: false, distanceKm: 8.3, popularity: 90 },
  { id: "h5", name: "고현 편한재활의학과 (예시)", department: "재활의학과", region: "고현동", night: false, weekend: true, english: false, distanceKm: 1.8, popularity: 58 },
];

export const SORT_EXPLAIN = {
  recommend: "추천순: 설문·분석 부위와 맞는 진료과이면 가산점, 선택한 조건(야간/주말/외국어)을 충족한 개수만큼 가산점을 줍니다.",
  popular: "인기순: 예시 값(준비 중)입니다. 실제 이용 데이터가 아닙니다.",
  distance: "거리순: 동(洞) 단위 예시 거리 기준 가까운 순입니다.",
};

export function filterAndSortHospitals(list, filters = {}, sort = "recommend", ctx = {}) {
  const { night, weekend, english, department } = filters;
  const out = list.filter((h) =>
    (!night || h.night) && (!weekend || h.weekend) && (!english || h.english) &&
    (!department || h.department === department));
  const score = (h) => {
    let s = ctx.recommendedDepartment && h.department === ctx.recommendedDepartment ? 10 : 0;
    for (const k of ["night", "weekend", "english"]) if (ctx.preferences?.[k] && h[k]) s += 1;
    return s;
  };
  const cmp = {
    recommend: (a, b) => score(b) - score(a) || a.distanceKm - b.distanceKm,
    popular: (a, b) => b.popularity - a.popularity,
    distance: (a, b) => a.distanceKm - b.distanceKm,
  }[sort] ?? (() => 0);
  return [...out].sort(cmp);
}
