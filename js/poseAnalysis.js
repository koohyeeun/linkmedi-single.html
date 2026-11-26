// 참고 코드(썬해드)와 같은 MediaPipe Pose(legacy CDN) 방식. 영상/카메라 모두 브라우저 안에서만 처리한다.
import { analyzeFrames } from "./analysis.js";
import { calculateJointAngles, isValidFrame } from "./angles.js";

export const SAMPLE_FPS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pose = null;
let handler = null;
function ensurePose() {
  if (pose) return pose;
  if (typeof Pose === "undefined") throw new Error("Pose 라이브러리를 불러오지 못했어요(인터넷 확인)");
  pose = new Pose({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
  pose.setOptions({ modelComplexity: 1, smoothLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  pose.onResults((r) => handler && handler(r));
  return pose;
}

export function detect(image) {
  const p = ensurePose();
  return new Promise((resolve, reject) => {
    handler = resolve;
    p.send({ image }).catch(reject);
  });
}

// 캔버스에 영상 프레임 + 골격 + 관절각 라벨을 그린다 (메모리에서만, 저장하지 않음)
export function drawFrame(canvas, image, lm) {
  const vw = image.videoWidth || image.width, vh = image.videoHeight || image.height;
  if (!vw) return;
  const w = Math.min(640, vw);
  canvas.width = w; canvas.height = Math.round((vh * w) / vw);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!lm) return;
  if (typeof drawConnectors === "function" && typeof POSE_CONNECTIONS !== "undefined") {
    drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: "#00FF00", lineWidth: 3 });
    drawLandmarks(ctx, lm, { color: "#FF0000", lineWidth: 1, radius: 3 });
  }
  if (!isValidFrame(lm)) return;
  const a = calculateJointAngles(lm);
  const k = a.side === "L" ? { sh: 11, el: 13, hip: 23 } : { sh: 12, el: 14, hip: 24 };
  const label = (text, p) => {
    ctx.font = "bold 14px sans-serif"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.fillStyle = "#ffeb3b";
    const x = p.x * canvas.width + 6, y = p.y * canvas.height;
    ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
  };
  label(`몸통 ${Math.round(a.trunkFlexionDeg)}°`, lm[k.hip]);
  label(`목 ${Math.round(a.neckFlexionDeg)}°`, lm[k.sh]);
  label(`팔 ${Math.round(a.armElevationDeg)}°`, lm[k.el]);
}

// 업로드 영상: 3fps로 시크하며 분석
export async function analyzeVideo(file, { canvas, signal, onProgress = () => {} } = {}) {
  ensurePose();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.src = url;
  try {
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error("영상을 읽을 수 없어요.")); });
    const n = Math.max(1, Math.floor(video.duration * SAMPLE_FPS));
    const frames = [];
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      await new Promise((res) => { video.onseeked = res; video.currentTime = Math.min(i / SAMPLE_FPS, video.duration - 0.01); });
      const lm = (await detect(video)).poseLandmarks ?? null;
      if (canvas) drawFrame(canvas, video, lm);
      frames.push(lm);
      onProgress((i + 1) / n);
    }
    return analyzeFrames(frames);
  } finally {
    video.removeAttribute("src"); video.load();
    URL.revokeObjectURL(url);
  }
}

// 라이브 카메라 미리보기(골격 표시). stop()으로 종료.
export async function startCamera(video, canvas) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 카메라를 지원하지 않아요.");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 640, height: 480 }, audio: false });
  video.srcObject = stream; video.muted = true; video.playsInline = true;
  await video.play();
  ensurePose();
  let running = true, recording = null;
  const loop = (async () => {
    while (running) {
      const t0 = performance.now();
      const lm = (await detect(video)).poseLandmarks ?? null;
      drawFrame(canvas, video, lm);
      if (recording) recording.push(lm);
      await sleep(Math.max(0, 1000 / SAMPLE_FPS - (performance.now() - t0)));
    }
  })();
  return {
    startRecording() { recording = []; },
    get recordedCount() { return recording ? recording.length : 0; },
    finishRecording() { const f = recording ?? []; recording = null; return analyzeFrames(f); },
    async stop() { running = false; await loop.catch(() => {}); stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; },
  };
}
