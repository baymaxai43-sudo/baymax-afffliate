import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Baymax-Shoppey — your autonomous affiliate copilot',
  description:
    'Private AI that runs your AliExpress affiliate store: content, scheduling, tracking — on autopilot for TikTok & YouTube.',
  icons: { icon: '/logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
