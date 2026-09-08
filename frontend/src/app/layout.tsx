import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'VOXSHIELD | AI Voice Impersonation & Fraud Prevention Platform',
  description: 'Real-time detection and prevention of voice cloning impersonation attacks, social engineering, and fraud.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className={`${inter.className} bg-[#1A1A1F] text-[#F5F5F7] min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
