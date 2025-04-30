/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL,
    NEXT_PUBLIC_ATP_CLIENT_ID: process.env.NEXT_PUBLIC_ATP_CLIENT_ID,
    NEXT_PUBLIC_ATP_REDIRECT_URI: process.env.NEXT_PUBLIC_ATP_REDIRECT_URI,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    API_URL: process.env.API_URL,
    OAUTH_LAMBDA_URL: process.env.OAUTH_LAMBDA_URL
  }
};

export default nextConfig;
