import type { Metadata, Viewport } from 'next';
import Providers from '@/components/Providers';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#030712',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'PR Sentinel — AI Code Review for GitHub PRs',
  description:
    'Paste a GitHub PR URL and get a review posted as inline comments on the PR — security, bugs, performance, and more. Uses your own free Gemini API key.',
  keywords: ['code review', 'pull request', 'AI', 'Gemini', 'GitHub', 'security', 'inline comments'],
  openGraph: {
    title: 'PR Sentinel — AI Code Review for GitHub PRs',
    description:
      'Paste a GitHub PR URL and get a review posted as inline comments — security findings, bugs, suggested fixes. Powered by Google Gemini (BYOK).',
    type: 'website',
    siteName: 'PR Sentinel',
  },
  twitter: {
    card: 'summary',
    title: 'PR Sentinel — AI Code Review for GitHub PRs',
    description:
      'Paste a GitHub PR URL. Get inline review comments posted on the PR. Powered by Google Gemini — free API key required.',
  },
  robots: 'index, follow',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-gray-950 text-white font-sans">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-violet-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-br-lg">
          Skip to main content
        </a>
        <Providers>
          <div id="main-content">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
