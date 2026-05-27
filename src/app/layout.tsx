import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PR Sentinel — AI-Powered Code Review',
  description:
    'Automated pull request reviews powered by Gemini 3.5 Flash. Find bugs, security issues, and code quality problems instantly.',
  keywords: ['code review', 'pull request', 'AI', 'Gemini', 'GitHub'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased bg-gray-950 text-white`}>
        {children}
      </body>
    </html>
  );
}
