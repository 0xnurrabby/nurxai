"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    try { localStorage.setItem("nurxai_theme", next ? "dark" : "light"); } catch {}
  }

  return (
    <button className="nb-btn" onClick={toggle} aria-label="Toggle theme">
      {dark ? "☀ Light" : "☾ Dark"}
    </button>
  );
}
