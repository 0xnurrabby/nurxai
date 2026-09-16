"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import { clearBrowserSession, restoreBrowserSession } from "@/lib/client-session";

export default function Navbar() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("nurxai_jwt");
    setLoggedIn(!!token);
    try {
      const u = JSON.parse(localStorage.getItem("nurxai_user") || "null");
      setIsAdmin(!!u?.isAdmin);
    } catch {}
    if (!token) {
      void restoreBrowserSession().then((session) => {
        if (!session) return;
        setLoggedIn(true);
        setIsAdmin(Boolean(session.user.isAdmin));
      });
    }
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !mobileMenuRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function logout() {
    await clearBrowserSession();
    window.location.href = "/";
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="site-header border-b-2 border-ink dark:border-nightInk">
      <nav className="max-w-6xl mx-auto px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="brand-link flex min-w-0 items-center gap-2 font-display font-black text-xl sm:text-2xl tracking-tight"
          onClick={closeMenu}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.png"
            alt="NurAi"
            width={28}
            height={28}
            className="brand-mark rounded-md border-2 border-ink dark:border-nightInk"
          />
          <span className="truncate">NurAi</span>
        </Link>

        <div className="nav-actions flex items-center justify-end gap-2">
          <Link href="/" className="nb-btn nav-link nav-link-home">
            Home
          </Link>
          <Link href="/pricing" className="nb-btn nav-link">
            Pricing
          </Link>

          {mounted && loggedIn ? (
            <Link href="/dashboard" className="nb-btn nb-btn-primary nav-primary">
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className="nb-btn nb-btn-primary nav-primary">
              Sign in
            </Link>
          )}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              className="nb-btn nav-menu-trigger"
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-dots">
                <circle cx="5" cy="12" r="2.1" fill="#0052ff" />
                <circle cx="12" cy="12" r="2.1" fill="#ec4899" />
                <circle cx="19" cy="12" r="2.1" fill="#22c55e" />
              </svg>
            </button>

            <div
              className={`nav-menu ${menuOpen ? "nav-menu-open" : ""}`}
              role="menu"
              aria-hidden={!menuOpen}
            >
              <div className="nav-menu-panel">
                <Link href="/" className="nav-menu-item nav-menu-home" role="menuitem" onClick={closeMenu}>
                  <span>Home</span>
                  <small>Main page</small>
                </Link>
                <Link href="/pricing" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
                  <span>Pricing</span>
                  <small>Plans and billing</small>
                </Link>

                {mounted && loggedIn ? (
                  <>
                    <Link href="/dashboard" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
                      <span>Dashboard</span>
                      <small>Usage and subscription</small>
                    </Link>
                    <Link href="/settings" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
                      <span>Settings</span>
                      <small>Style and projects</small>
                    </Link>
                    {isAdmin && (
                      <Link href="/admin" className="nav-menu-item nav-menu-warn" role="menuitem" onClick={closeMenu}>
                        <span>Admin</span>
                        <small>Users and billing</small>
                      </Link>
                    )}
                    <button type="button" onClick={logout} className="nav-menu-item nav-menu-button" role="menuitem">
                      <span>Sign out</span>
                      <small>End this session</small>
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
                      <span>Sign in</span>
                      <small>Existing account</small>
                    </Link>
                    <Link href="/signup" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
                      <span>Start free trial</span>
                      <small>3 days included</small>
                    </Link>
                  </>
                )}

                <div className="nav-menu-divider" />
                <ThemeToggle variant="menu" />
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div ref={mobileMenuRef} className="mobile-nav-shell">
        <button
          type="button"
          className="nb-btn mobile-nav-trigger"
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-dots">
            <circle cx="5" cy="12" r="2.1" fill="#0052ff" />
            <circle cx="12" cy="12" r="2.1" fill="#ec4899" />
            <circle cx="19" cy="12" r="2.1" fill="#22c55e" />
          </svg>
        </button>

        <div
          className={`mobile-nav-menu ${menuOpen ? "mobile-nav-menu-open" : ""}`}
          role="menu"
          aria-hidden={!menuOpen}
        >
          <div className="nav-menu-panel">
            <Link href="/" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
              <span>Home</span>
              <small>Main page</small>
            </Link>
            <Link href="/pricing" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
              <span>Pricing</span>
              <small>Plans and billing</small>
            </Link>

            {mounted && loggedIn ? (
              <>
                <Link href="/dashboard" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
                  <span>Dashboard</span>
                  <small>Usage and subscription</small>
                </Link>
                <Link href="/settings" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
                  <span>Settings</span>
                  <small>Style and projects</small>
                </Link>
                {isAdmin && (
                  <Link href="/admin" className="nav-menu-item nav-menu-warn" role="menuitem" onClick={closeMenu}>
                    <span>Admin</span>
                    <small>Users and billing</small>
                  </Link>
                )}
                <button type="button" onClick={logout} className="nav-menu-item nav-menu-button" role="menuitem">
                  <span>Sign out</span>
                  <small>End this session</small>
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
                  <span>Sign in</span>
                  <small>Existing account</small>
                </Link>
                <Link href="/signup" className="nav-menu-item" role="menuitem" onClick={closeMenu}>
                  <span>Start free trial</span>
                  <small>3 days included</small>
                </Link>
              </>
            )}

            <div className="nav-menu-divider" />
            <ThemeToggle variant="menu" />
          </div>
        </div>
      </div>
    </header>
  );
}
