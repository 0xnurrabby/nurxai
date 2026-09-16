"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import "./AuthScene.css";

const VALUE_LINES = [
  "no auto-posting. ever.",
  "you type the final word.",
  "four drafts, one voice — yours.",
  "your judgment stays yours."
];

const POKE_LINES = ["hey! 👀", "that tickles", "i saw that", "still human-approved 😌", "stop poking me", "drafting… hold on"];

export default function AuthScene() {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [line, setLine] = useState(0);
  const [pokeLine, setPokeLine] = useState<string | null>(null);
  const [poked, setPoked] = useState(false);
  const pokeIndex = useRef(0);
  const pokeTimer = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLine((value) => (value + 1) % VALUE_LINES.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const element = sceneRef.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    function onMove(event: PointerEvent) {
      const rect = element!.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      setLook({ x: Math.max(-1, Math.min(1, x * 2.2)), y: Math.max(-1, Math.min(1, y * 2.2)) });
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [sceneRef]);

  useEffect(() => {
    return () => {
      if (pokeTimer.current) window.clearTimeout(pokeTimer.current);
    };
  }, []);

  function poke() {
    pokeIndex.current = (pokeIndex.current + 1) % POKE_LINES.length;
    setPokeLine(POKE_LINES[pokeIndex.current]);
    setPoked(true);
    if (pokeTimer.current) window.clearTimeout(pokeTimer.current);
    pokeTimer.current = window.setTimeout(() => {
      setPokeLine(null);
      setPoked(false);
    }, 2100);
  }

  const eyeShift = { "--lx": look.x, "--ly": look.y } as CSSProperties;

  return (
    <div
      ref={sceneRef}
      className={`auth-scene ${poked ? "is-poked" : ""}`}
      style={eyeShift}
      onClick={poke}
      role="img"
      aria-label="Playful NurAi characters hovering around a chat bubble"
    >
      <span className="auth-spark spark-a" aria-hidden="true" />
      <span className="auth-spark spark-b" aria-hidden="true" />
      <span className="auth-spark spark-c" aria-hidden="true" />

      <div className="auth-bubble" aria-hidden="true">
        <span key={pokeLine ?? VALUE_LINES[line]} className="auth-bubble-line">
          {pokeLine ?? VALUE_LINES[line]}
        </span>
      </div>

      <div className="a-char a-purple" aria-hidden="true">
        <div className="a-eyes">
          <span className="a-eye"><span className="a-pupil" /></span>
          <span className="a-eye"><span className="a-pupil" /></span>
        </div>
      </div>

      <div className="a-char a-dark" aria-hidden="true">
        <div className="a-eyes">
          <span className="a-eye"><span className="a-pupil" /></span>
          <span className="a-eye"><span className="a-pupil" /></span>
        </div>
        <span className="a-line-mouth" />
      </div>

      <div className="a-char a-yellow" aria-hidden="true">
        <div className="a-eyes">
          <span className="a-eye a-eye-dark"><span className="a-pupil a-pupil-light" /></span>
          <span className="a-eye a-eye-dark"><span className="a-pupil a-pupil-light" /></span>
        </div>
        <span className="a-line-mouth" />
      </div>

      <div className="a-char a-orange" aria-hidden="true">
        <div className="a-eyes">
          <span className="a-eye a-eye-dark"><span className="a-pupil a-pupil-light" /></span>
          <span className="a-eye a-eye-dark"><span className="a-pupil a-pupil-light" /></span>
        </div>
        <span className="a-smile" />
      </div>
    </div>
  );
}
