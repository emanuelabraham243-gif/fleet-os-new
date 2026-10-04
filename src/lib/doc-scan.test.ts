import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import type * as OpenCv from '@techstark/opencv-js';
import { orderCorners, readyOpenCv, scanDocument, type CV, type Point, type RgbaImage } from './doc-scan';

let cv: CV;
beforeAll(async () => {
  // Plain Node require: letting Vite transform the 10 MB OpenCV build stalls the test run.
  cv = await readyOpenCv(createRequire(import.meta.url)('@techstark/opencv-js'));
}, 30_000);

// A flat 600x800 "page": off-white paper with faint grey text bars.
const PAGE_W = 600;
const PAGE_H = 800;
function makePage(): OpenCv.Mat {
  const page = new cv.Mat(PAGE_H, PAGE_W, cv.CV_8UC4, new cv.Scalar(225, 222, 215, 255));
  for (let y = 120; y < 420; y += 60) {
    cv.rectangle(page, new cv.Point(80, y), new cv.Point(520, y + 18), new cv.Scalar(120, 120, 120, 255), -1);
  }
  return page;
}

// Where the page lands in the 1200x900 "photo": a 450x600 page rotated 8 degrees, with the
// top edge 30px narrower than the bottom (phone held at a slight angle).
const SCENE_W = 1200;
const SCENE_H = 900;
const TRUE_CORNERS: Point[] = (() => {
  const a = (8 * Math.PI) / 180;
  const local = [
    { x: -225 + 15, y: -300 },
    { x: 225 - 15, y: -300 },
    { x: 225, y: 300 },
    { x: -225, y: 300 },
  ];
  return local.map((p) => ({
    x: Math.round(600 + p.x * Math.cos(a) - p.y * Math.sin(a)),
    y: Math.round(450 + p.x * Math.sin(a) + p.y * Math.cos(a)),
  }));
})();

/** Dark table, page warped onto it, and a strong shadow over the left half. */
function makePhoto(): RgbaImage {
  const page = makePage();
  const scene = new cv.Mat(SCENE_H, SCENE_W, cv.CV_8UC4, new cv.Scalar(70, 60, 50, 255));
  const warped = new cv.Mat();
  const mask = new cv.Mat();
  const white = new cv.Mat(PAGE_H, PAGE_W, cv.CV_8UC1, new cv.Scalar(255));
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, PAGE_W - 1, 0, PAGE_W - 1, PAGE_H - 1, 0, PAGE_H - 1]);
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, TRUE_CORNERS.flatMap((p) => [p.x, p.y]));
  const m = cv.getPerspectiveTransform(from, to);
  const size = new cv.Size(SCENE_W, SCENE_H);
  cv.warpPerspective(page, warped, m, size);
  cv.warpPerspective(white, mask, m, size);
  warped.copyTo(scene, mask);

  // Uneven lighting: brightness falls from 100% on the right to 55% on the left.
  const data = scene.data;
  for (let y = 0; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const f = 0.55 + 0.45 * (x / SCENE_W);
      const i = (y * SCENE_W + x) * 4;
      data[i] = data[i] * f;
      data[i + 1] = data[i + 1] * f;
      data[i + 2] = data[i + 2] * f;
    }
  }
  const out = { data: new Uint8ClampedArray(scene.data), width: SCENE_W, height: SCENE_H };
  [page, scene, warped, mask, white, from, to, m].forEach((x) => x.delete());
  return out;
}

/** Mean grey level of a rectangle of an RGBA image. */
function meanGray(img: RgbaImage, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.round(y0); y < Math.round(y1); y++) {
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      const i = (y * img.width + x) * 4;
      sum += (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
      n++;
    }
  }
  return sum / n;
}

describe('orderCorners', () => {
  it('orders any permutation as tl, tr, br, bl', () => {
    const shuffled = [TRUE_CORNERS[2], TRUE_CORNERS[0], TRUE_CORNERS[3], TRUE_CORNERS[1]];
    expect(orderCorners(shuffled)).toEqual(TRUE_CORNERS);
  });
});

describe('scanDocument', () => {
  it('finds the crooked page, flattens it to the right shape, and cleans it up', () => {
    const photo = makePhoto();
    const scan = scanDocument(cv, photo);

    // Edges detected within a few pixels of the true page corners.
    expect(scan.corners).not.toBeNull();
    scan.corners!.forEach((c, i) => {
      expect(Math.hypot(c.x - TRUE_CORNERS[i].x, c.y - TRUE_CORNERS[i].y)).toBeLessThan(12);
    });

    // Deskewed + cropped: output is the page's 3:4 portrait shape, not the 4:3 photo.
    expect(scan.width / scan.height).toBeGreaterThan(0.7);
    expect(scan.width / scan.height).toBeLessThan(0.8);

    // Page coordinates scaled into the output.
    const sx = scan.width / PAGE_W;
    const sy = scan.height / PAGE_H;
    // Blank paper under the shadow (left side) is dim grey in the photo; must come out near white.
    const shadowedPaperBefore = meanGray(photo, 300, 600, 380, 680);
    const shadowedPaperAfter = meanGray(scan, 40 * sx, 520 * sy, 140 * sx, 600 * sy);
    expect(shadowedPaperBefore).toBeLessThan(170);
    expect(shadowedPaperAfter).toBeGreaterThan(235);
    // Paper on the bright side is white too (lighting evened out, not just brightened).
    expect(meanGray(scan, 460 * sx, 520 * sy, 560 * sx, 600 * sy)).toBeGreaterThan(235);
    // Faint text bar (grey 120 on 225 paper) gets clearly darker than it was.
    const bar = meanGray(scan, 200 * sx, 125 * sy, 400 * sx, 133 * sy);
    expect(bar).toBeLessThan(90);
  });

  it('keeps the whole photo (cleaned) when there is no document outline', () => {
    const w = 640;
    const h = 480;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = 150 + ((i * 7919) % 40); // flat, noisy grey: nothing to detect
      data.set([v, v, v, 255], i * 4);
    }
    const scan = scanDocument(cv, { data, width: w, height: h });
    expect(scan.corners).toBeNull();
    expect(scan.width).toBe(w);
    expect(scan.height).toBe(h);
    expect(scan.data.length).toBe(w * h * 4);
  });
});
