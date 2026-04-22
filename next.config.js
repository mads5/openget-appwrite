/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      { source: "/donate", destination: "/", permanent: true },
      { source: "/donate/success", destination: "/", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
    ],
  },
};

module.exports = nextConfig;
