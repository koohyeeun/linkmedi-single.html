// 브라우저에서 tests/run.mjs를 그대로 돌리기 위한 최소 assert (node 없이 실행용)
const fail = (m) => { throw new Error(m); };
export default {
  equal: (a, b, m) => (a === b ? 0 : fail(m ?? `expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`)),
  ok: (v, m) => (v ? 0 : fail(m ?? "assertion failed")),
  throws: (fn) => { try { fn(); } catch { return; } fail("expected to throw"); },
};
