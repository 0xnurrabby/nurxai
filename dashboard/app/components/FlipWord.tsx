"use client";

import { useEffect, useState } from "react";

const WORDS = ["yourself", "a founder", "a creator", "a builder", "a lead", "a human"];

export default function FlipWord() {
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimate(false);
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % WORDS.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, []);

  const previous = (index - 1 + WORDS.length) % WORDS.length;

  return (
    <span className="h-flip h-accent">
      {WORDS.map((word, wordIndex) => {
        let state = "h-flip-idle";
        if (!animate) {
          state = wordIndex === 0 ? "h-flip-active" : "h-flip-idle";
        } else if (wordIndex === index) {
          state = "h-flip-active";
        } else if (wordIndex === previous) {
          state = "h-flip-leaving";
        }
        const visible = animate ? wordIndex === index : wordIndex === 0;
        return (
          <span key={word} className={`h-flip-word ${state}`} aria-hidden={!visible}>
            {word}.
          </span>
        );
      })}
    </span>
  );
}
