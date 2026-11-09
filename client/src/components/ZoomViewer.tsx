import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2, Maximize, Minus, Plus, X } from "lucide-react";
import { imageUrl, originalUrl } from "@/lib/images";
import type { LotImage } from "@/lib/types";

interface Props {
  images: LotImage[];
  index: number;
  title: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}

const MIN = 1;
const MAX = 8;

/**
 * Deep-zoom inspection viewer. Shows a 1600px rendition immediately, then progressively
 * swaps in the full-resolution original once the user zooms in. Supports wheel zoom anchored
 * at the cursor, drag to pan, pinch-zoom on touch, double-click/tap to toggle, and keyboard.
 */
export function ZoomViewer({ images, index, title, onIndex, onClose }: Props) {
  const img = images[index];
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const { scale } = view;
  const pos = { x: view.x, y: view.y };
  const [hiRes, setHiRes] = useState<string | null>(null);
  const [hiResLoading, setHiResLoading] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  useEffect(() => {
    reset();
    setHiRes(null);
  }, [index, reset]);

  // Load the original only when zoomed in enough for it to matter.
  useEffect(() => {
    if (scale < 1.6 || hiRes || hiResLoading) return;
    const src = originalUrl(img);
    setHiResLoading(true);
    const pre = new Image();
    pre.referrerPolicy = "no-referrer";
    pre.onload = () => {
      setHiRes(src);
      setHiResLoading(false);
    };
    pre.onerror = () => setHiResLoading(false);
    pre.src = src;
  }, [scale, img, hiRes, hiResLoading]);

  /** Zooms to `next`, keeping the point under (cx, cy) fixed on screen. */
  const zoomAt = useCallback((next: number, cx?: number, cy?: number) => {
    const r = stage.current?.getBoundingClientRect();
    const clamped = Math.min(MAX, Math.max(MIN, next));
    const ox = r && cx != null ? cx - r.left - r.width / 2 : 0;
    const oy = r && cy != null ? cy - r.top - r.height / 2 : 0;
    setView((v) => {
      if (clamped === 1) return { scale: 1, x: 0, y: 0 };
      const k = clamped / v.scale;
      return { scale: clamped, x: ox - (ox - v.x) * k, y: oy - (oy - v.y) * k };
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomAt(scale * 1.5);
      else if (e.key === "-") zoomAt(scale / 1.5);
      else if (e.key === "ArrowRight" && images.length > 1) onIndex((index + 1) % images.length);
      else if (e.key === "ArrowLeft" && images.length > 1) onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [scale, index, images.length, onClose, onIndex, zoomAt]);

  const onWheel = (e: RWheelEvent) => zoomAt(scale * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);

  const onPointerDown = (e: RPointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      dragStart.current = null;
    } else {
      dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    }
  };
  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((pinchStart.current.scale * d) / pinchStart.current.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (dragStart.current && scale > 1) {
      const d = dragStart.current;
      setView((v) => ({ ...v, x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }));
    }
  };
  const onPointerUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragStart.current = null;
  };

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex flex-col bg-[#0d0c0b] text-paper" role="dialog" aria-modal="true" aria-label={`Inspect ${title}`}>
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <div className="min-w-0 truncate font-display text-lg">{title}</div>
        <div className="flex items-center gap-1">
          {hiResLoading && <span className="mr-2 flex items-center gap-1 text-xs text-paper/60"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading full resolution</span>}
          {hiRes && <span className="mr-2 text-xs text-gold-light">Full resolution</span>}
          <button className="p-2 hover:text-gold-light" onClick={() => zoomAt(scale / 1.5)} aria-label="Zoom out"><Minus className="h-5 w-5" /></button>
          <span className="w-12 text-center tabular-nums text-paper/70">{Math.round(scale * 100)}%</span>
          <button className="p-2 hover:text-gold-light" onClick={() => zoomAt(scale * 1.5)} aria-label="Zoom in"><Plus className="h-5 w-5" /></button>
          <button className="p-2 hover:text-gold-light" onClick={reset} aria-label="Fit to screen"><Maximize className="h-5 w-5" /></button>
          <button className="ml-2 p-2 hover:text-gold-light" onClick={onClose} aria-label="Close"><X className="h-6 w-6" /></button>
        </div>
      </div>

      <div
        ref={stage}
        className="relative flex-1 touch-none select-none overflow-hidden"
        style={{ cursor: scale > 1 ? (dragStart.current ? "grabbing" : "grab") : "zoom-in" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => (scale > 1 ? reset() : zoomAt(3, e.clientX, e.clientY))}
      >
        <img
          src={hiRes ?? imageUrl(img, { w: 1600 })}
          alt={title}
          draggable={false}
          referrerPolicy="no-referrer"
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain will-change-transform"
          style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})`, transition: dragStart.current || pinchStart.current ? "none" : "transform 120ms ease-out" }}
        />
        {images.length > 1 && (
          <>
            <button className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 p-3 hover:bg-black/70" onClick={() => onIndex((index - 1 + images.length) % images.length)} aria-label="Previous image"><ChevronLeft /></button>
            <button className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 p-3 hover:bg-black/70" onClick={() => onIndex((index + 1) % images.length)} aria-label="Next image"><ChevronRight /></button>
          </>
        )}
      </div>
      <p className="py-2 text-center text-xs text-paper/40">Scroll or pinch to zoom · drag to pan · double-click to toggle</p>
    </motion.div>,
    document.body,
  );
}
