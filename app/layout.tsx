import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Campus Sentinel · Incident Operations',
  description: 'Campus incident reporting, coordinated response and semantic SOP retrieval.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
