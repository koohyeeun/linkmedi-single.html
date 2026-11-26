export const LIMITS = { minSec: 10, maxSec: 30, maxBytes: 100 * 1024 * 1024 };

export function validateVideoMeta({ type, size, duration }, consent) {
  const errors = [];
  if (!consent) errors.push("민감 건강정보 처리에 동의해 주세요.");
  if (!type || !type.startsWith("video/")) errors.push("동영상 파일(MP4/MOV/WebM)만 올릴 수 있어요.");
  if (size > LIMITS.maxBytes) errors.push("파일 크기는 100MB 이하여야 해요.");
  if (!(duration >= LIMITS.minSec && duration <= LIMITS.maxSec)) errors.push("영상 길이는 10~30초여야 해요.");
  return { valid: errors.length === 0, errors };
}

export function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("영상을 읽을 수 없어요.")); };
    v.src = url;
  });
}
