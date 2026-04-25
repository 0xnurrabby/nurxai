"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setLoggedIn(!!localStorage.getItem("nurxai_jwt"));
  }, []);

  function logout() {
    localStorage.removeItem("nurxai_jwt");
    localStorage.removeItem("nurxai_user");
    window.location.href = "/";
  }

  return (
    <header className="border-b-2 border-ink dark:border-nightInk">
      <nav className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
        <Link href="/" className="font-display font-black text-2xl tracking-tight">
          NurAi
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="nb-btn">Pricing</Link>
          {mounted && loggedIn ? (
            <>
              <Link href="/dashboard" className="nb-btn nb-btn-primary">Dashboard</Link>
              <button onClick={logout} className="nb-btn">Sign out</button>
            </>
          ) : (
            <>
              <Link href="/login" className="nb-btn nb-btn-primary">Sign in</Link>
            </>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
