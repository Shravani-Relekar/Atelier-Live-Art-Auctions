import { useState } from "react";
import clsx from "clsx";
import { ImageOff } from "lucide-react";
import { imageUrl, srcSet } from "@/lib/images";
import type { LotImage } from "@/lib/types";

interface Props {
  image?: Pick<LotImage, "provider" | "publicId" | "url" | "alt"> | null;
  alt?: string;
  width?: number;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  fit?: "contain" | "cover";
  priority?: boolean;
}

/** Responsive, lazy-loaded artwork image with a soft fade-in and graceful failure. */
export function ArtImage({ image, alt, width = 800, sizes = "(min-width: 1024px) 33vw, 100vw", className, imgClassName, fit = "contain", priority }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!image || failed) {
    return (
      <div className={clsx("flex items-center justify-center bg-paper-deep text-ink-muted", className)}>
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className={clsx("relative overflow-hidden bg-paper-deep", className)}>
      <img
        src={imageUrl(image, { w: width })}
        srcSet={srcSet(image)}
        sizes={sizes}
        alt={alt ?? image.alt ?? ""}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={clsx(
          "h-full w-full transition duration-700",
          fit === "contain" ? "object-contain" : "object-cover",
          loaded ? "opacity-100" : "opacity-0",
          imgClassName,
        )}
      />
    </div>
  );
}
