// localStorage에는 설문/점수/부위/날짜만 저장. 영상·프레임·타임라인은 저장하지 않는다.
const KEY = "linkmedi.assessments";

export function loadAssessments() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function saveAssessment(record) {
  const list = loadAssessments();
  const { timeline, ...analysis } = record.analysis;
  list.push({ ...record, analysis });
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function clearAssessments() { localStorage.removeItem(KEY); }
