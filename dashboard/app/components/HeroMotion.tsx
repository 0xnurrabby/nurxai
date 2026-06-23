"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  tone: number;
  lane: number;
};

const COLORS = ["#83cfff", "#8ee38a", "#fff064", "#ff9fbd"];

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function HeroMotion() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const motionCanvas = canvas;
    const drawCtx = ctx;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: 0, y: 0, active: false };
    const particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let tick = 0;

    function resetParticles() {
      particles.length = 0;
      const count = Math.max(28, Math.min(48, Math.round(width / 25)));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: height * (0.18 + Math.random() * 0.68),
          vx: 0.38 + Math.random() * 0.55,
          vy: (Math.random() - 0.5) * 0.16,
          size: 6 + Math.random() * 10,
          phase: Math.random() * Math.PI * 2,
          tone: i % COLORS.length,
          lane: i % 5
        });
      }
    }

    function resize() {
      const rect = motionCanvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      motionCanvas.width = Math.round(width * dpr);
      motionCanvas.height = Math.round(height * dpr);
      drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      resetParticles();
    }

    function drawBubble(x: number, y: number, w: number, h: number, color: string, alpha: number) {
      drawCtx.save();
      drawCtx.globalAlpha = alpha;
      drawCtx.fillStyle = color;
      drawCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "#0f1419";
      drawCtx.shadowBlur = 14;
      drawCtx.shadowColor = withAlpha(color, 0.45);
      drawCtx.lineWidth = 2.25;
      drawCtx.beginPath();
      drawCtx.roundRect(x, y, w, h, 10);
      drawCtx.fill();
      drawCtx.stroke();
      drawCtx.restore();
    }

    function drawSignalField(ink: string) {
      const laneCount = 5;

      for (let i = 0; i < laneCount; i++) {
        const y = height * (0.22 + i * 0.14) + Math.sin(tick * 1.3 + i) * 14;
        const lift = Math.sin(tick * 0.9 + i * 1.7) * 34;
        const color = COLORS[i % COLORS.length];

        drawCtx.save();
        drawCtx.globalAlpha = 0.64;
        drawCtx.strokeStyle = color;
        drawCtx.lineWidth = 5;
        drawCtx.lineCap = "round";
        drawCtx.shadowBlur = 16;
        drawCtx.shadowColor = withAlpha(color, 0.28);
        drawCtx.setLineDash([34, 34]);
        drawCtx.lineDashOffset = -tick * 118 - i * 24;
        drawCtx.beginPath();
        drawCtx.moveTo(-90, y);
        drawCtx.bezierCurveTo(width * 0.24, y - 58 + lift, width * 0.64, y + 54 - lift, width + 90, y);
        drawCtx.stroke();
        drawCtx.restore();

        drawCtx.save();
        drawCtx.globalAlpha = 0.28;
        drawCtx.strokeStyle = ink;
        drawCtx.lineWidth = 1.9;
        drawCtx.lineCap = "round";
        drawCtx.setLineDash([7, 20]);
        drawCtx.lineDashOffset = tick * 92 + i * 16;
        drawCtx.beginPath();
        drawCtx.moveTo(-70, y + 20);
        drawCtx.bezierCurveTo(width * 0.28, y + 64 - lift, width * 0.72, y - 42 + lift, width + 70, y + 20);
        drawCtx.stroke();
        drawCtx.restore();
      }
    }

    function drawSignalSweep() {
      const sweepX = ((tick * 110) % (width + 280)) - 140;
      const gradient = drawCtx.createLinearGradient(sweepX - 120, 0, sweepX + 120, 0);
      gradient.addColorStop(0, "rgba(131, 207, 255, 0)");
      gradient.addColorStop(0.5, "rgba(131, 207, 255, 0.32)");
      gradient.addColorStop(1, "rgba(142, 227, 138, 0)");

      drawCtx.save();
      drawCtx.translate(width / 2, height / 2);
      drawCtx.rotate(-0.08);
      drawCtx.fillStyle = gradient;
      drawCtx.fillRect(sweepX - width / 2 - 120, -height, 240, height * 2);
      drawCtx.restore();
    }

    function draw() {
      tick += prefersReducedMotion ? 0 : 0.02;
      drawCtx.clearRect(0, 0, width, height);

      const rootStyle = getComputedStyle(document.documentElement);
      const ink = rootStyle.getPropertyValue("--border").trim() || "#0f1419";

      drawSignalSweep();
      drawSignalField(ink);

      drawCtx.save();
      drawCtx.strokeStyle = ink;
      drawCtx.lineWidth = 2.15;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const linkDistance = 185;
          if (distance < linkDistance) {
            drawCtx.globalAlpha = (1 - distance / linkDistance) * 0.38;
            drawCtx.beginPath();
            drawCtx.moveTo(a.x, a.y);
            drawCtx.lineTo(b.x, b.y);
            drawCtx.stroke();
          }
        }
      }
      drawCtx.restore();

      for (const p of particles) {
        if (!prefersReducedMotion) {
          const laneY = height * (0.2 + p.lane * 0.14) + Math.sin(tick * 1.15 + p.phase) * 20;
          p.x += p.vx + Math.cos(tick + p.phase) * 0.2;
          p.y += p.vy + Math.sin(tick + p.phase) * 0.16 + (laneY - p.y) * 0.004;
        }

        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          if (distance < 175) {
            const force = (175 - distance) / 175;
            p.x += (dx / distance) * force * 3.6;
            p.y += (dy / distance) * force * 3.6;
          }
        }

        if (p.x < -30) p.x = width + 30;
        if (p.x > width + 30) p.x = -30;
        if (p.y < -30) p.y = height + 30;
        if (p.y > height + 30) p.y = -30;

        const w = p.size * (4.1 + Math.sin(tick + p.phase) * 0.26);
        const h = p.size * 1.95;
        drawBubble(p.x - w / 2, p.y - h / 2, w, h, COLORS[p.tone], 0.72);
      }

      drawCtx.save();
      drawCtx.globalAlpha = 0.44;
      drawCtx.strokeStyle = ink;
      drawCtx.lineWidth = 2.35;
      drawCtx.lineCap = "round";
      const centerX = width * 0.5;
      const centerY = height * 0.48;
      for (let i = 0; i < 3; i++) {
        const radius = 86 + i * 42 + Math.sin(tick * 1.6 + i) * 4;
        if (i === 1) {
          drawCtx.setLineDash([22, 22]);
          drawCtx.lineDashOffset = -tick * 72;
        } else {
          drawCtx.setLineDash([]);
        }
        drawCtx.beginPath();
        drawCtx.ellipse(centerX, centerY, radius * 1.9, radius * 0.58, -0.08, 0, Math.PI * 2);
        drawCtx.stroke();
      }
      drawCtx.restore();

      if (pointer.active) {
        drawCtx.save();
        drawCtx.globalAlpha = 0.36;
        drawCtx.strokeStyle = COLORS[Math.floor(tick * 6) % COLORS.length];
        drawCtx.lineWidth = 2;
        drawCtx.setLineDash([10, 12]);
        drawCtx.lineDashOffset = -tick * 80;
        drawCtx.beginPath();
        drawCtx.ellipse(pointer.x, pointer.y, 58, 28, -0.1, 0, Math.PI * 2);
        drawCtx.stroke();
        drawCtx.restore();
      }

      if (!prefersReducedMotion) raf = requestAnimationFrame(draw);
    }

    function movePointer(event: PointerEvent) {
      const rect = motionCanvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    }

    function leavePointer() {
      pointer.active = false;
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    motionCanvas.addEventListener("pointermove", movePointer);
    motionCanvas.addEventListener("pointerleave", leavePointer);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      motionCanvas.removeEventListener("pointermove", movePointer);
      motionCanvas.removeEventListener("pointerleave", leavePointer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="hero-motion"
      aria-hidden="true"
    />
  );
}
