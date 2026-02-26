import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: Number(process.env.PORT || 3000),
    hmr: process.env.SHOPIFY_FLAG_DEV_PREVIEW === "true" ? false : undefined,
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: false,
        v3_lazyRouteDiscovery: false,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  ssr: {
    // Required so Shopify App Remix + jose work correctly in SSR
    noExternal: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
}) satisfies UserConfig;
