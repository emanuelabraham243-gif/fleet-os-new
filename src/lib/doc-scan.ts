// Deterministic document-scanner cleanup built on OpenCV.js (no AI, no network).
// Pipeline: find the paper's four corners -> perspective-warp it flat (deskew + crop)
// -> remove uneven lighting/shadows -> boost contrast -> sharpen.
// Every function takes the loaded `cv` module so this file stays framework-free and
// runs the same in the browser and in Node (unit tests).
import type * as OpenCv from '@techstark/opencv-js';

export type CV = typeof OpenCv;
type Mat = OpenCv.Mat;

/** Anything shaped like browser ImageData (RGBA, row-major). */
export type RgbaImage = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };
export type Point = { x: number; y: number };
export type ScanResult = RgbaImage & {
  /** Detected paper corners in input-image pixels (tl, tr, br, bl), or null if none was found. */
  corners: Point[] | null;
};

/** Longest side of the saved scan. Keeps text crisp while keeping uploads small. */
export const MAX_SCAN_SIDE = 2400;
const DETECT_SIDE = 800; // edge detection runs on a downscaled copy
const LIGHTING_SIDE = 600; // background (lighting) estimate runs on a downscaled copy
const MIN_DOC_AREA = 0.2; // a detected quad must cover at least 20% of the photo

/**
 * Loads OpenCV.js once. The ~10 MB module is only fetched when this is called
 * (dynamic import), so pages that never open the camera never download it.
 */
let cvPromise: Promise<CV> | null = null;
export function loadOpenCv(): Promise<CV> {
  cvPromise ??= import('@techstark/opencv-js').then(readyOpenCv);
  cvPromise.catch(() => {
    cvPromise = null; // allow a retry after a failed download
  });
  return cvPromise;
}

/** Resolves the OpenCV.js module export once its WebAssembly runtime is ready. */
export function readyOpenCv(mod: unknown): Promise<CV> {
  const m = ((mod as { default?: unknown }).default ?? mod) as {
    Mat?: unknown;
    then?: (cb: () => void) => unknown;
    onRuntimeInitialized?: () => void;
  };
  const ready =
    typeof m.Mat === 'function'
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          if (typeof m.then === 'function') m.then(() => resolve());
          else m.onRuntimeInitialized = resolve;
        });
  return ready.then(() => {
    // The Emscripten module is a "thenable" that resolves to itself; resolving a promise with it
    // would make the caller wait forever. It is ready now, so drop `then` before handing it out.
    delete m.then;
    return m as unknown as CV;
  });
}

/** Orders four corners as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts: Point[]): Point[] {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.y - a.x - (b.y - b.x));
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function polygonArea(p: Point[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function toMat(cv: CV, img: RgbaImage): Mat {
  const m = new cv.Mat(img.height, img.width, cv.CV_8UC4);
  m.data.set(img.data);
  return m;
}

function resizeToLongSide(cv: CV, src: Mat, side: number): { mat: Mat; scale: number } {
  const scale = Math.min(1, side / Math.max(src.cols, src.rows));
  const mat = new cv.Mat();
  if (scale === 1) src.copyTo(mat);
  else cv.resize(src, mat, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)), 0, 0, cv.INTER_AREA);
  return { mat, scale };
}

/** Largest convex 4-corner polygon among the contours of a binary image, or null. */
function largestQuad(cv: CV, binary: Mat, minArea: number): Point[] | null {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates: { i: number; area: number }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      c.delete();
      if (area >= minArea) candidates.push({ i, area });
    }
    candidates.sort((a, b) => b.area - a.area);

    for (const { i } of candidates.slice(0, 5)) {
      const c = contours.get(i);
      const hull = new cv.Mat();
      const approx = new cv.Mat();
      try {
        cv.convexHull(c, hull, false, true);
        const peri = cv.arcLength(hull, true);
        for (const eps of [0.02, 0.03, 0.05, 0.08]) {
          cv.approxPolyDP(hull, approx, eps * peri, true);
          if (approx.rows === 4 && cv.isContourConvex(approx)) {
            const d = approx.data32S;
            const pts = [0, 1, 2, 3].map((k) => ({ x: d[k * 2], y: d[k * 2 + 1] }));
            if (polygonArea(pts) >= minArea) return pts;
          }
        }
      } finally {
        c.delete();
        hull.delete();
        approx.delete();
      }
    }
    return null;
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

/** Finds the paper's corners (input-pixel coordinates, ordered tl/tr/br/bl) or null. */
export function detectCorners(cv: CV, src: Mat): Point[] | null {
  const { mat: small, scale } = resizeToLongSide(cv, src, DETECT_SIDE);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const otsu = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  try {
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    const minArea = small.cols * small.rows * MIN_DOC_AREA;

    // Strategy 1: edges (works on busy or similar-coloured backgrounds).
    cv.Canny(gray, edges, 50, 150);
    cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 2);
    const fromEdges = largestQuad(cv, edges, minArea);

    // Strategy 2: brightness split (light paper on a darker surface, faint edges).
    cv.threshold(gray, otsu, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(otsu, otsu, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 3);
    const fromOtsu = largestQuad(cv, otsu, minArea);

    const best = [fromEdges, fromOtsu]
      .filter((q): q is Point[] => q !== null)
      .sort((a, b) => polygonArea(b) - polygonArea(a))[0];
    if (!best) return null;
    return orderCorners(best.map((p) => ({ x: p.x / scale, y: p.y / scale })));
  } finally {
    small.delete();
    gray.delete();
    edges.delete();
    otsu.delete();
    kernel.delete();
  }
}

/** Perspective-warps the quad to a flat rectangle, capped at MAX_SCAN_SIDE. */
function warp(cv: CV, src: Mat, c: Point[]): Mat {
  const [tl, tr, br, bl] = c;
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const s = Math.min(1, MAX_SCAN_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * s));
  h = Math.max(1, Math.round(h * s));

  const from = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w - 1, 0, w - 1, h - 1, 0, h - 1]);
  const m = cv.getPerspectiveTransform(from, to);
  const out = new cv.Mat();
  try {
    cv.warpPerspective(src, out, m, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    return out;
  } finally {
    from.delete();
    to.delete();
    m.delete();
  }
}

/**
 * Removes uneven lighting and shadows, then boosts contrast and sharpens.
 * Lighting: each channel is divided by a blurred "paper only" background estimate
 * (dilate removes the dark text, median smooths), which flattens shadows to white.
 */
export function enhance(cv: CV, rgba: Mat): Mat {
  const rgb = new cv.Mat();
  const channels = new cv.MatVector();
  const merged = new cv.MatVector();
  const out = new cv.Mat();
  const blur = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
  try {
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
    cv.split(rgb, channels);
    const size = new cv.Size(rgb.cols, rgb.rows);
    for (let i = 0; i < 3; i++) {
      const ch = channels.get(i);
      const { mat: bg } = resizeToLongSide(cv, ch, LIGHTING_SIDE);
      const flat = new cv.Mat();
      try {
        cv.dilate(bg, bg, kernel);
        cv.medianBlur(bg, bg, 21);
        cv.resize(bg, bg, size, 0, 0, cv.INTER_LINEAR);
        cv.divide(ch, bg, flat, 255);
        merged.push_back(flat);
      } finally {
        ch.delete();
        bg.delete();
        flat.delete();
      }
    }
    cv.merge(merged, rgb);

    // Tone curve: levels 40..245 -> 0..255 (paper noise to pure white), then a gamma that
    // darkens mid-tones so faint or washed-out text becomes clearly legible.
    const table = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      const t = Math.min(1, Math.max(0, (v - 40) / (245 - 40)));
      table[v] = Math.round(255 * t ** 1.6);
    }
    const lut = cv.matFromArray(1, 256, cv.CV_8UC1, Array.from(table));
    try {
      cv.LUT(rgb, lut, rgb);
    } finally {
      lut.delete();
    }

    // Unsharp mask, radius scaled to the image so small and large scans look alike.
    const sigma = Math.max(1, Math.max(rgb.cols, rgb.rows) / 1500);
    cv.GaussianBlur(rgb, blur, new cv.Size(0, 0), sigma);
    cv.addWeighted(rgb, 1.6, blur, -0.6, 0, rgb);

    cv.cvtColor(rgb, out, cv.COLOR_RGB2RGBA);
    return out;
  } finally {
    rgb.delete();
    channels.delete();
    merged.delete();
    blur.delete();
    kernel.delete();
  }
}

/**
 * Full scan: detect -> deskew/crop -> clean up. If no document outline is found the
 * whole photo is kept (only resized and cleaned up), so a capture never fails outright.
 */
export function scanDocument(cv: CV, img: RgbaImage): ScanResult {
  const src = toMat(cv, img);
  let flat: Mat | null = null;
  let cleaned: Mat | null = null;
  try {
    const corners = detectCorners(cv, src);
    flat = corners ? warp(cv, src, corners) : resizeToLongSide(cv, src, MAX_SCAN_SIDE).mat;
    cleaned = enhance(cv, flat);
    return {
      data: new Uint8ClampedArray(cleaned.data),
      width: cleaned.cols,
      height: cleaned.rows,
      corners,
    };
  } finally {
    src.delete();
    flat?.delete();
    cleaned?.delete();
  }
}
