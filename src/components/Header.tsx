'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b border-white/5 bg-gray-950/80 backdrop-blur-xl sticky top-0 z-50" role="banner">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              PR Sentinel
            </h1>
            <p className="text-[10px] text-gray-500 -mt-0.5 tracking-widest uppercase">
              AI Code Review
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1" aria-label="Main navigation">
            <Link
              href="/"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                pathname === '/' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
              }`}
              aria-current={pathname === '/' ? 'page' : undefined}
            >
              Manual review
            </Link>
            <Link
              href="/repositories"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                pathname === '/repositories' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
              }`}
              aria-current={pathname === '/repositories' ? 'page' : undefined}
            >
              Auto bot
            </Link>
          </nav>

          {/* Mobile nav toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden rounded-md border border-white/10 p-2 text-gray-400 hover:text-white"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          <span className="text-[10px] text-gray-600 font-mono hidden sm:block">
            Powered by Gemini 3.5 Flash
          </span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20" aria-label="System status: live">
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[10px] text-emerald-400 font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-white/5 px-4 py-3 space-y-1" aria-label="Mobile navigation">
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className={`block rounded-md px-3 py-2.5 text-sm font-medium transition ${
              pathname === '/' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            Manual review
          </Link>
          <Link
            href="/repositories"
            onClick={() => setMobileOpen(false)}
            className={`block rounded-md px-3 py-2.5 text-sm font-medium transition ${
              pathname === '/repositories' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
            aria-current={pathname === '/repositories' ? 'page' : undefined}
          >
            Auto bot
          </Link>
        </nav>
      )}
    </header>
  );
}
