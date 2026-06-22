import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TTB Label Verification',
  description: 'Verify alcohol beverage label artwork against TTB application data',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50">{children}</body>
    </html>
  );
}
