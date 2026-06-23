"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle({ variant = "button" }: { variant?: "button" | "menu" }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    try {
      localStorage.setItem("nurxai_theme", next ? "dark" : "light");
    } catch {}
  }

  if (variant === "menu") {
    return (
      <button type="button" className="nav-menu-item nav-menu-button" onClick={toggle}>
        <span>{dark ? "Light mode" : "Dark mode"}</span>
        <small>{dark ? "Switch to clean daylight" : "Switch to night focus"}</small>
      </button>
    );
  }

  return (
    <button className="nb-btn" onClick={toggle} aria-label="Toggle theme">
      {dark ? "Light" : "Dark"}
    </button>
  );
}
