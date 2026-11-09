import type { LotImage } from "./types";

/**
 * Image URL builder.
 *  - CLOUDINARY: on-the-fly transformations (resize, auto format/quality, smart crop).
 *  - EXTERNAL (seed data from Wikimedia Commons): uses Wikimedia's standard thumbnail widths.
 */
export interface ImgOpts {
  w?: number;
  h?: number;
  crop?: "fill" | "limit" | "fit";
  quality?: "auto" | "auto:best" | "auto:good" | number;
}

let cloudName: string | null = null;
export function setCloudName(name: string | null) {
  cloudName = name;
}

const WIKIMEDIA_STEPS = [330, 500, 960, 1280, 1920];

export function imageUrl(img: Pick<LotImage, "provider" | "publicId" | "url">, opts: ImgOpts = {}): string {
  if (img.provider === "CLOUDINARY" && img.publicId) {
    const cn = cloudName ?? cloudNameFromUrl(img.url);
    if (cn) {
      const t = ["f_auto", `q_${opts.quality ?? "auto"}`, `c_${opts.crop ?? "limit"}`];
      if (opts.w) t.push(`w_${opts.w}`);
      if (opts.h) t.push(`h_${opts.h}`);
      if (opts.crop === "fill") t.push("g_auto");
      t.push("dpr_auto");
      return `https://res.cloudinary.com/${cn}/image/upload/${t.join(",")}/${img.publicId}`;
    }
  }
  return wikimediaSized(img.url, opts.w);
}

/** Highest-resolution source for deep zoom. */
export function originalUrl(img: Pick<LotImage, "provider" | "publicId" | "url">): string {
  if (img.provider === "CLOUDINARY" && img.publicId) return imageUrl(img, { quality: "auto:best" });
  const m = img.url.match(/^(https:\/\/)(?:thumb|upload)\.wikimedia\.org\/wikipedia\/commons\/thumb\/(.+?)\/\d+px-[^/]+$/);
  if (m) return `${m[1]}upload.wikimedia.org/wikipedia/commons/${m[2]}`;
  return img.url;
}

export function srcSet(img: Pick<LotImage, "provider" | "publicId" | "url">, widths = [400, 800, 1200, 1600]) {
  if (img.provider === "CLOUDINARY" && img.publicId) {
    return widths.map((w) => `${imageUrl(img, { w })} ${w}w`).join(", ");
  }
  if (/\/thumb\/.+\/\d+px-/.test(img.url)) {
    return WIKIMEDIA_STEPS.map((w) => `${wikimediaSized(img.url, w)} ${w}w`).join(", ");
  }
  return undefined;
}

function wikimediaSized(url: string, w?: number) {
  if (!w || !/\/thumb\/.+\/\d+px-/.test(url)) return url;
  const step = WIKIMEDIA_STEPS.find((s) => s >= w) ?? 1920;
  return url.replace(/\/\d+px-([^/]+)$/, `/${step}px-$1`);
}

function cloudNameFromUrl(url: string) {
  return url.match(/res\.cloudinary\.com\/([^/]+)\//)?.[1] ?? null;
}
