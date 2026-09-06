import { useEffect, useRef } from "react";

/**
 * VISUAL SYSTEM ACTIVITY (not market data).
 * Single canvas renders every environment layer through one animation loop:
 * stars, drifting particles, faint grid, data particles on paths and
 * occasional node connection lines. Honours prefers-reduced-motion.
 */
export function CosmicBackground({ intensity = 1 }: { intensity?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;

    type Star = { x: number; y: number; r: number; a: number; vx: number; tw: number };
    type Dust = { x: number; y: number; vx: number; vy: number; a: number };
    type Node = { x: number; y: number; vx: number; vy: number };
    type Packet = { i: number; t: number; speed: number };

    let stars: Star[] = [];
    let dust: Dust[] = [];
    let nodes: Node[] = [];
    let packets: Packet[] = [];

    function build() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const area = w * h;
      const starCount = Math.min(420, Math.round((area / 5200) * intensity));
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.15 + 0.25,
        a: Math.random() * 0.55 + 0.15,
        vx: -(Math.random() * 0.045 + 0.008),
        tw: Math.random() * Math.PI * 2,
      }));
      dust = Array.from({ length: Math.min(90, Math.round((area / 26000) * intensity)) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.16,
        vy: -(Math.random() * 0.14 + 0.02),
        a: Math.random() * 0.28 + 0.06,
      }));
      nodes = Array.from({ length: 14 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
      }));
      packets = Array.from({ length: 10 }, () => ({
        i: Math.floor(Math.random() * nodes.length),
        t: Math.random(),
        speed: Math.random() * 0.0035 + 0.0012,
      }));
    }

    function grid(time: number) {
      const step = 96;
      const off = reduced ? 0 : (time * 0.006) % step;
      ctx!.lineWidth = 1;
      ctx!.strokeStyle = "oklch(0.55 0.06 268 / 0.055)";
      ctx!.beginPath();
      for (let x = -step + off; x < w + step; x += step) {
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
      }
      for (let y = -step + off; y < h + step; y += step) {
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
      }
      ctx!.stroke();
    }

    function draw(time: number) {
      ctx!.clearRect(0, 0, w, h);
      grid(time);

      // stars
      for (const s of stars) {
        if (!reduced) {
          s.x += s.vx;
          s.tw += 0.012;
          if (s.x < -2) s.x = w + 2;
        }
        const a = s.a * (reduced ? 1 : 0.72 + Math.sin(s.tw) * 0.28);
        ctx!.beginPath();
        ctx!.fillStyle = `oklch(0.95 0.02 250 / ${a.toFixed(3)})`;
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // dust particles
      for (const d of dust) {
        if (!reduced) {
          d.x += d.vx;
          d.y += d.vy;
          if (d.y < -4) {
            d.y = h + 4;
            d.x = Math.random() * w;
          }
          if (d.x < -4) d.x = w + 4;
          if (d.x > w + 4) d.x = -4;
        }
        ctx!.beginPath();
        ctx!.fillStyle = `oklch(0.82 0.13 205 / ${d.a.toFixed(3)})`;
        ctx!.arc(d.x, d.y, 1.1, 0, Math.PI * 2);
        ctx!.fill();
      }

      // node network + travelling data packets
      for (const n of nodes) {
        if (!reduced) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > w) n.vx *= -1;
          if (n.y < 0 || n.y > h) n.vy *= -1;
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 260) {
            ctx!.strokeStyle = `oklch(0.7 0.12 250 / ${(0.09 * (1 - dist / 260)).toFixed(3)})`;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
        const n = nodes[i]!;
        ctx!.beginPath();
        ctx!.fillStyle = "oklch(0.72 0.15 250 / 0.35)";
        ctx!.arc(n.x, n.y, 1.6, 0, Math.PI * 2);
        ctx!.fill();
      }
      if (!reduced) {
        for (const p of packets) {
          const from = nodes[p.i % nodes.length]!;
          const to = nodes[(p.i + 3) % nodes.length]!;
          p.t += p.speed;
          if (p.t > 1) {
            p.t = 0;
            p.i = Math.floor(Math.random() * nodes.length);
          }
          const x = from.x + (to.x - from.x) * p.t;
          const y = from.y + (to.y - from.y) * p.t;
          ctx!.beginPath();
          ctx!.fillStyle = "oklch(0.85 0.13 205 / 0.7)";
          ctx!.arc(x, y, 1.7, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    }

    build();
    if (reduced) {
      draw(0);
      cancelAnimationFrame(raf);
      raf = 0;
      ctx.clearRect(0, 0, w, h);
      grid(0);
      for (const s of stars) {
        ctx.beginPath();
        ctx.fillStyle = `oklch(0.95 0.02 250 / ${s.a.toFixed(3)})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      raf = requestAnimationFrame(draw);
    }

    const onResize = () => {
      build();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [intensity]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {/* nebula / galaxy depth layers */}
      <div
        className="absolute -left-40 -top-40 h-[70vh] w-[70vw] rounded-full opacity-45 blur-[120px]"
        style={{ background: "radial-gradient(circle, oklch(0.42 0.14 296 / 0.5), transparent 65%)" }}
      />
      <div
        className="absolute -right-32 top-1/4 h-[60vh] w-[55vw] rounded-full opacity-35 blur-[130px]"
        style={{ background: "radial-gradient(circle, oklch(0.4 0.1 232 / 0.45), transparent 62%)" }}
      />
      <div
        className="absolute bottom-[-25vh] left-1/4 h-[55vh] w-[60vw] rounded-full opacity-25 blur-[140px]"
        style={{ background: "radial-gradient(circle, oklch(0.38 0.11 268 / 0.4), transparent 66%)" }}
      />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 0%, transparent 35%, oklch(0.1 0.02 275 / 0.75) 100%)" }}
      />
    </div>
  );
}
