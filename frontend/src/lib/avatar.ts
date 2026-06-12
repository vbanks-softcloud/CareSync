/**
 * Avatar identifiers + preset library.
 *
 * The UserProfile.picture field stores ONE of three things:
 *   1. ""                              → no avatar set; UI shows initials.
 *   2. "preset:<id>"                   → one of the built-ins below.
 *   3. "data:image/jpeg;base64,..."    → an upload the user resized to fit
 *                                        inside Cognito's ~2KB attribute cap.
 *
 * Presets are intentionally emoji-based: zero asset weight, render
 * natively on every platform, and the colored background gives each one a
 * distinct identity. Twelve options is enough variety to feel personal
 * without becoming a paradox-of-choice — and they're profession-neutral
 * (animals + nature) so anyone signing in can find something they like.
 */

export type AvatarPreset = {
  /** Stable identifier used as the `preset:<id>` suffix. Never rename
   * these — old profiles store them by string and would render as
   * "no avatar" if the id disappeared. */
  id: string;
  /** Single emoji shown in the circle. */
  emoji: string;
  /** Short label shown under the option in the picker. */
  label: string;
  /** Tailwind class for the background. We use lightly-tinted colors
   * rather than fully saturated ones so the emoji stays the focus. */
  bg: string;
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "stethoscope", emoji: "🩺", label: "Stethoscope", bg: "bg-rose-100" },
  { id: "heart", emoji: "❤️", label: "Heart", bg: "bg-red-100" },
  { id: "sprout", emoji: "🌱", label: "Sprout", bg: "bg-emerald-100" },
  { id: "sun", emoji: "☀️", label: "Sun", bg: "bg-amber-100" },
  { id: "flower", emoji: "🌸", label: "Blossom", bg: "bg-pink-100" },
  { id: "bear", emoji: "🐻", label: "Bear", bg: "bg-amber-200" },
  { id: "panda", emoji: "🐼", label: "Panda", bg: "bg-slate-100" },
  { id: "fox", emoji: "🦊", label: "Fox", bg: "bg-orange-100" },
  { id: "rabbit", emoji: "🐰", label: "Rabbit", bg: "bg-pink-50" },
  { id: "owl", emoji: "🦉", label: "Owl", bg: "bg-stone-100" },
  { id: "cat", emoji: "🐱", label: "Cat", bg: "bg-violet-100" },
  { id: "coffee", emoji: "☕", label: "Coffee", bg: "bg-yellow-100" },
];

const PRESETS_BY_ID = new Map(AVATAR_PRESETS.map((p) => [p.id, p]));

export type AvatarKind =
  | { kind: "none" }
  | { kind: "preset"; preset: AvatarPreset }
  | { kind: "image"; src: string };

/** Parses the raw picture string into something the renderer can switch
 * on. Unknown preset ids and malformed data URLs fall back to "none" so
 * the UI gracefully degrades to initials rather than crashing. */
export function parseAvatar(picture: string | null | undefined): AvatarKind {
  if (!picture) return { kind: "none" };
  if (picture.startsWith("preset:")) {
    const id = picture.slice("preset:".length);
    const preset = PRESETS_BY_ID.get(id);
    if (!preset) return { kind: "none" };
    return { kind: "preset", preset };
  }
  if (picture.startsWith("data:image/")) {
    return { kind: "image", src: picture };
  }
  // An http(s):// URL would land here, but we don't currently support
  // those (no S3 bucket wired in). Treat as unset for now.
  return { kind: "none" };
}

/**
 * Resizes the given image File to a small JPEG data URL that fits inside
 * Cognito's ~2KB `picture` attribute cap. Strategy: progressively shrink
 * dimensions and/or drop JPEG quality until we're under the byte budget.
 *
 * We try a few attempts because the user's image could be a 4MB photo —
 * one pass at 64x64@0.6 sometimes still produces 3-4KB of base64 if the
 * photo has lots of detail. The loop guarantees we either return a value
 * that fits or throw so the caller can show a "couldn't shrink" error.
 */
export async function resizeImageForAvatar(file: File): Promise<string> {
  // Cognito user pool default max for `picture` is 2048 chars. Leave a
  // bit of headroom so the full attribute write (which includes the field
  // name/quoting) doesn't bust the limit either.
  const MAX_CHARS = 1900;

  const bitmap = await loadBitmap(file);

  // Try progressively smaller dimensions + lower quality until we fit.
  const attempts: Array<{ size: number; quality: number }> = [
    { size: 96, quality: 0.7 },
    { size: 80, quality: 0.6 },
    { size: 64, quality: 0.55 },
    { size: 56, quality: 0.5 },
    { size: 48, quality: 0.45 },
    { size: 40, quality: 0.4 },
  ];

  for (const { size, quality } of attempts) {
    const dataUrl = bitmapToJpeg(bitmap, size, quality);
    if (dataUrl.length <= MAX_CHARS) {
      return dataUrl;
    }
  }

  throw new Error(
    "Couldn't shrink this image small enough. Try a simpler photo or pick one of the preset avatars instead.",
  );
}

/** Renders the bitmap into a square JPEG, center-cropping so portraits
 * and landscapes both look reasonable. */
function bitmapToJpeg(bitmap: ImageBitmap, size: number, quality: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available.");

  // White background so transparent PNGs don't end up with black halos
  // after the JPEG conversion drops the alpha channel.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const { sx, sy, sw, sh } = squareCrop(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Centered square crop of a w×h rectangle — picks the largest square
 * that fits and trims equal margins from the longer side. */
function squareCrop(w: number, h: number): { sx: number; sy: number; sw: number; sh: number } {
  if (w === h) return { sx: 0, sy: 0, sw: w, sh: h };
  if (w > h) {
    const sx = Math.floor((w - h) / 2);
    return { sx, sy: 0, sw: h, sh: h };
  }
  const sy = Math.floor((h - w) / 2);
  return { sx: 0, sy, sw: w, sh: w };
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  // createImageBitmap is the modern path — it decodes off the main
  // thread and handles EXIF orientation automatically.
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  }
  // Fallback path for older browsers: load via an <img> + Image() then
  // wrap in a Promise. Same end result, just synchronous decoding.
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // The legacy path can't return a true ImageBitmap, but the renderer
      // only needs .width/.height + draw-image compatibility, so cast.
      resolve(img as unknown as ImageBitmap);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
