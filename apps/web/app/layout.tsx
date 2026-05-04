import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import './global.css';

export const metadata: Metadata = {
  title: 'Hamilton',
  description: "The commander's aide-de-camp for the comms channel.",
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0a0d12',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Cesium static-asset base URL — set BEFORE Cesium.js loads so all
         * worker / image / model fetches stay on-origin (NFR-01). */}
        <Script
          id="cesium-base-url"
          strategy="beforeInteractive"
        >{`window.CESIUM_BASE_URL='/cesium/';`}</Script>
        <Script src="/cesium/Cesium.js" strategy="beforeInteractive" />
        <link rel="stylesheet" href="/cesium/Widgets/widgets.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
