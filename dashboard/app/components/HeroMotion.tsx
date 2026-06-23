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
};

const COLORS = ["#b8e1ff", "#c4f0c2", "#fff89c", "#ffd1dc"];

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
      const count = Math.max(18, Math.min(34, Math.round(width / 34)));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.32,
          vy: (Math.random() - 0.5) * 0.22,
          size: 5 + Math.random() * 8,
          phase: Math.random() * Math.PI * 2,
          tone: i % COLORS.length
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
      drawCtx.lineWidth = 2;
      drawCtx.beginPath();
      drawCtx.roundRect(x, y, w, h, 10);
      drawCtx.fill();
      drawCtx.stroke();
      drawCtx.restore();
    }

    function draw() {
      tick += prefersReducedMotion ? 0 : 0.012;
      drawCtx.clearRect(0, 0, width, height);

      const rootStyle = getComputedStyle(document.documentElement);
      const ink = rootStyle.getPropertyValue("--border").trim() || "#0f1419";

      drawCtx.save();
      drawCtx.globalAlpha = 0.11;
      drawCtx.strokeStyle = ink;
      drawCtx.lineWidth = 2;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 150) {
            drawCtx.globalAlpha = (1 - distance / 150) * 0.14;
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
          p.x += p.vx + Math.cos(tick + p.phase) * 0.08;
          p.y += p.vy + Math.sin(tick + p.phase) * 0.06;
        }

        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          if (distance < 135) {
            const force = (135 - distance) / 135;
            p.x += (dx / distance) * force * 2.3;
            p.y += (dy / distance) * force * 2.3;
          }
        }

        if (p.x < -30) p.x = width + 30;
        if (p.x > width + 30) p.x = -30;
        if (p.y < -30) p.y = height + 30;
        if (p.y > height + 30) p.y = -30;

        const w = p.size * (3.7 + Math.sin(tick + p.phase) * 0.18);
        const h = p.size * 1.85;
        drawBubble(p.x - w / 2, p.y - h / 2, w, h, COLORS[p.tone], 0.34);
      }

      drawCtx.save();
      drawCtx.globalAlpha = 0.2;
      drawCtx.strokeStyle = ink;
      drawCtx.lineWidth = 2;
      const centerX = width * 0.5;
      const centerY = height * 0.48;
      for (let i = 0; i < 3; i++) {
        const radius = 86 + i * 42 + Math.sin(tick * 1.6 + i) * 4;
        drawCtx.beginPath();
        drawCtx.ellipse(centerX, centerY, radius * 1.9, radius * 0.58, -0.08, 0, Math.PI * 2);
        drawCtx.stroke();
      }
      drawCtx.restore();

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
