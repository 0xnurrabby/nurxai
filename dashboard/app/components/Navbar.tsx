import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  return (
    <header className="border-b-2 border-ink dark:border-nightInk">
      <nav className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
        <Link href="/" className="font-display font-black text-2xl tracking-tight">
          NurAi
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="nb-btn">Pricing</Link>
          <Link href="/login" className="nb-btn nb-btn-primary">Sign in</Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
