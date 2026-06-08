/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tree-shake icon/primitive barrels so only the icons actually used ship to
  // the client instead of the whole package.
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-slot"],
  },
  // hero.tsx is the LCP image; AVIF/WebP cut its transfer size significantly.
  images: {
    formats: ["image/avif", "image/webp"],
  },
  compress: true,
};

export default nextConfig;
