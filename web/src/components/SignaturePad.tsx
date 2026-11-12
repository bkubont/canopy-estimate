import { useEffect, useRef } from 'react';

/**
 * Finger/stylus signature box. Calls onChange with a small PNG data URL after
 * each stroke ('' when cleared). Kept small (max 600px wide) so it syncs fast.
 */
export function SignaturePad({ value, onChange, label = 'Sign here' }: { value: string; onChange: (dataUrl: string) => void; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(false);

  // Size the canvas to its box and redraw the saved signature (also on rotate).
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Object.assign(ctx, { lineWidth: 2.4, lineCap: 'round', lineJoin: 'round', strokeStyle: '#1f2421' });
      if (value) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
        img.src = value;
      }
    };
    size();
    window.addEventListener('resize', size);
    return () => window.removeEventListener('resize', size);
    // Only redraw from `value` when it changes from outside (e.g. Clear).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === '']);

  const pt = (e: React.PointerEvent) => {
    const b = ref.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(exportSmall(ref.current!));
  };

  return (
    <div className="sig-wrap">
      <canvas
        ref={ref}
        className="sig"
        aria-label={label}
        role="img"
        onPointerDown={(e) => {
          drawing.current = true;
          last.current = pt(e);
          ref.current!.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const ctx = ref.current!.getContext('2d')!;
          const p = pt(e);
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
          dirty.current = true;
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <div className="sig-foot">
        <span className="muted small">{label}</span>
        <button
          type="button"
          className="link small"
          onClick={() => {
            const c = ref.current!;
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
            dirty.current = false;
            onChange('');
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function exportSmall(canvas: HTMLCanvasElement) {
  const maxW = 600;
  const scale = Math.min(1, maxW / canvas.width);
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
