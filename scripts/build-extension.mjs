import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { copyFileSync, mkdirSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const extensionDir = resolve(rootDir, "extension");
const distDir = resolve(extensionDir, "dist");

async function buildExtension() {
  console.log("[Build] Starting VeilGuard Extension build...");

  // Step 1: Build HTML pages (popup, options) and service worker (background.js)
  console.log("[Build] Step 1: Building HTML pages and service worker...");
  await build({
    root: extensionDir,
    plugins: [react(), tailwindcss()],
    configFile: false,
    build: {
      outDir: distDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(extensionDir, "popup.html"),
          options: resolve(extensionDir, "options.html"),
          background: resolve(extensionDir, "src/background/index.ts"),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "background") {
              return "background.js";
            }
            return "assets/[name]-[hash].js";
          },
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
        },
      },
    },
  });

  // Step 2: Build Content Script as standalone IIFE bundle
  console.log("[Build] Step 2: Building content script (IIFE)...");
  await build({
    root: extensionDir,
    configFile: false,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      lib: {
        entry: resolve(extensionDir, "src/content/index.ts"),
        name: "VeilGuardContent",
        formats: ["iife"],
        fileName: () => "content.js",
      },
      rollupOptions: {
        output: {
          extend: true,
        },
      },
    },
  });

  // Step 3: Build MAIN-world Script as standalone IIFE bundle
  console.log("[Build] Step 3: Building MAIN-world script (IIFE)...");
  await build({
    root: extensionDir,
    configFile: false,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      lib: {
        entry: resolve(extensionDir, "src/page-world/index.ts"),
        name: "VeilGuardPageWorld",
        formats: ["iife"],
        fileName: () => "page-world.js",
      },
      rollupOptions: {
        output: {
          extend: true,
        },
      },
    },
  });

  // Step 4: Copy manifest.json
  console.log("[Build] Step 4: Copying manifest.json...");
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  copyFileSync(
    resolve(extensionDir, "manifest.json"),
    resolve(distDir, "manifest.json")
  );

  console.log("[Build] Extension build complete -> extension/dist/");
}

buildExtension().catch((err) => {
  console.error("[Build] Extension build failed:", err);
  process.exit(1);
});
