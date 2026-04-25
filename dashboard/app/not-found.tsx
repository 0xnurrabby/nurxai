import Link from "next/link";
import Navbar from "./components/Navbar";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="max-w-md mx-auto px-5 py-20 text-center">
        <div className="nb-card p-8" style={{ background: "var(--accent3)" }}>
          <h1 className="font-display font-black text-5xl">404</h1>
          <p className="mt-3">This page doesn't exist.</p>
          <Link href="/" className="nb-btn nb-btn-primary mt-6 inline-block">
            Go home
          </Link>
        </div>
      </main>
    </>
  );
}
