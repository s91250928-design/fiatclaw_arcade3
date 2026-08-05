"use client";

/**
 * Load an image and chroma-key near-black pixels to alpha.
 * Used to billboard product-shot refs (claw) without a PNG alpha channel.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";

export function useChromaTexture(
  url: string,
  threshold = 32
): THREE.CanvasTexture | null {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]!,
          g = d[i + 1]!,
          b = d[i + 2]!;
        const m = Math.max(r, g, b);
        if (m < threshold) {
          d[i + 3] = 0;
        } else if (m < threshold + 18) {
          d[i + 3] = Math.floor(255 * ((m - threshold) / 18));
        }
      }
      ctx.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
      setTex(t);
    };
    img.onerror = () => {
      if (!cancelled) setTex(null);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, threshold]);

  useEffect(() => {
    return () => {
      tex?.dispose();
    };
  }, [tex]);

  return tex;
}
