import type { MetadataRoute } from 'next';

// Makes the app installable: Add to Dock in Safari, Install in Chrome and Edge,
// Add to Home Screen on a phone. The colours are the light theme's `--background`;
// the browser chrome follows the viewport `themeColor` in the root layout instead,
// which also covers the dark theme.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Backlog to the Future',
    short_name: 'Backlog to the Future',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#fafafa',
    icons: [{ src: '/brand/mascot.png', sizes: '1280x1280', type: 'image/png', purpose: 'any' }],
  };
}
