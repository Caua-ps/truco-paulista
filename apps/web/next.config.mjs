/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@truco/game-core'],
  output: 'standalone',
};

export default nextConfig;
