import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.duffel.com' },
      { protocol: 'https', hostname: '**.viator.com' },
      { protocol: 'https', hostname: 'maps.googleapis.com' },
      { protocol: 'https', hostname: '**.unsplash.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Rainforest (Amazon) product imagery
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      { protocol: 'https', hostname: '**.ssl-images-amazon.com' },
    ],
  },
  experimental: {
    after: true,
    serverActions: { allowedOrigins: ['localhost:3000', 'localhost:3005'] },
  },
}

export default nextConfig
