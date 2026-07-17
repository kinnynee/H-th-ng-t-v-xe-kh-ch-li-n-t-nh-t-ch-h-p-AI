const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/graphql',
        destination: process.env.GRAPHQL_URL || 'http://localhost:4000/graphql',
      },
    ];
  },
};

export default nextConfig;
