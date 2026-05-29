'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import Logo from './Logo';

/**
 * Header — sticky top navigation with logo, primary nav, status pill, and user menu.
 *
 * Treats /, /repositories, /settings as the three top-level destinations. The
 * status pill ("Live") is purely cosmetic — it signals "the app is healthy"
 * to the user; it doesn't probe a real backend.
 */
export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Review' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/repositories', label: 'Repositories' },
    { href: '/settings', label: 'Settings' },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/[0.06] bg-[rgba(5,5,7,0.75)] backdrop-blur-2xl"
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="transition-transform duration-300 group-hover:scale-105">
            <Logo size={32} />
          </div>
          <div className="leading-tight">
            <h1 className="text-[15px] font-bold text-white tracking-tight">PR Sentinel</h1>
            <p className="text-[9px] text-gray-500 tracking-[0.15em] uppercase font-medium">
              AI Code Review
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Desktop nav */}
          <nav
            className="hidden md:flex items-center gap-0.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1"
            aria-label="Main navigation"
          >
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                    active
                      ? 'text-white bg-gradient-to-b from-white/10 to-white/[0.04] shadow-sm shadow-violet-500/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile nav toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden rounded-lg border border-white/10 p-2 text-gray-400 hover:text-white hover:bg-white/5 transition"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Status pill — desktop only */}
          <div
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20"
            aria-label="System status: operational"
          >
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="animate-pulseRing absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[10px] text-emerald-300 font-semibold tracking-wide">
              OPERATIONAL
            </span>
          </div>

          {/* User menu */}
          {session?.user && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] pl-1 pr-2 py-1 hover:bg-white/[0.06] hover:border-white/15 transition"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-7 h-7 rounded-lg ring-1 ring-white/10"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
                    {(session.user.name?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <span className="text-xs text-gray-300 hidden lg:block max-w-[100px] truncate font-medium">
                  {session.user.login || session.user.name || 'User'}
                </span>
                <svg className="w-3 h-3 text-gray-500 hidden lg:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-white/10 bg-[rgba(15,16,24,0.95)] backdrop-blur-2xl shadow-2xl z-50 py-1.5 animate-fadeIn overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                      <p className="text-sm text-white font-semibold truncate">
                        {session.user.name || session.user.login}
                      </p>
                      {session.user.email && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{session.user.email}</p>
                      )}
                    </div>
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 transition"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Settings
                    </Link>
                    <button
                      type="button"
                      onClick={() => signOut({ callbackUrl: '/login' })}
                      className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/5 transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav
          className="md:hidden border-t border-white/[0.06] bg-[rgba(5,5,7,0.95)] backdrop-blur-2xl px-4 py-3 space-y-1 animate-fadeIn"
          aria-label="Mobile navigation"
        >
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {link.label}
              </Link>
            );
          })}
          {session?.user && (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="block w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-500/5 transition"
            >
              Sign out
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
