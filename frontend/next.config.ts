import path from 'node:path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // The repo root, so runtime code can import the API contract from ../shared
    // (the same module the backend uses) instead of keeping a copy.
    root: path.join(__dirname, '..'),
  },
};

export default withNextIntl(nextConfig);
