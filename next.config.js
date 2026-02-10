/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    const csp = [
      "default-src 'self'",
      // Next.js(App Router)が壊れない最低限（暫定）
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // Next/Image や data URL を許可
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      // OpenAI API 通信を許可
      "connect-src 'self' https://api.openai.com",
      // その他の基本防御
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'"
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          // ★CSPをここで一本化
          { key: "Content-Security-Policy", value: csp },

          // ★今回の「1回目OK→2回目304で壊れる」を止める
          // まずはDocumentをキャッシュさせない（安定化優先）
          { key: "Cache-Control", value: "no-store" },

          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" }
          // X-XSS-Protection は現代ブラウザでは非推奨なので入れなくてOK
        ]
      }
    ];
  }
};

module.exports = nextConfig;

