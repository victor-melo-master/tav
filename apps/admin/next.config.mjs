/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Todo lo que no sea un asset estático con hash en el nombre:
        // el HTML del panel depende de la sesión y no debe quedar en
        // cachés compartidos (Next le ponía s-maxage=31536000).
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
