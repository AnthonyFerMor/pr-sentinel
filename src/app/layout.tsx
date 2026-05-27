import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#030712',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'PR Sentinel — AI-Powered Code Review',
  description:
    'Automated pull request reviews powered by Gemini 3.5 Flash. Find bugs, security issues, and code quality problems instantly.',
  keywords: ['code review', 'pull request', 'AI', 'Gemini', 'GitHub', 'security', 'code quality'],
  openGraph: {
    title: 'PR Sentinel — AI-Powered Code Review',
    description: 'Paste a GitHub PR URL and get an instant, thorough code review powered by Gemini 3.5 Flash with context caching.',
    type: 'website',
    siteName: 'PR Sentinel',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PR Sentinel — AI-Powered Code Review',
    description: 'Automated pull request reviews powered by Gemini 3.5 Flash.',
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
        <div id="main-content">
          {children}
        </div>
      </body>
    </html>
  );
}
