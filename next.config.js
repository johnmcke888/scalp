/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Externalize ws package to avoid webpack bundling issues with native bindings
  serverExternalPackages: ['ws'],
};

module.exports = nextConfig;
