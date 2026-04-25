"use client";
import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="max-w-md mx-auto px-5 py-20 text-center">
      <div className="nb-card p-8">
        <h1 className="font-display font-black text-3xl">Something broke</h1>
        <p className="mt-3 opacity-70">An unexpected error occurred.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button className="nb-btn nb-btn-primary" onClick={reset}>Try again</button>
          <Link href="/" className="nb-btn">Home</Link>
        </div>
      </div>
    </main>
  );
}
