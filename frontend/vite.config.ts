import { defineOpenZeppelinAdapterViteConfig } from '@openzeppelin/adapters-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const frontendRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineOpenZeppelinAdapterViteConfig({
  ecosystems: ['evm'],
  config: {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        // @uniswap packages import from ethers v5's subpath; shim re-exports via ethers v6.
        'ethers/lib/utils': fileURLToPath(
          new URL('./src/shims/ethers-lib-utils.ts', import.meta.url),
        ),
        // @walletconnect/core (root node_modules) can't find this in the pnpm store;
        // point it at the copy pnpm installed under frontend/node_modules.
        '@walletconnect/keyvaluestorage': fileURLToPath(
          new URL('./node_modules/@walletconnect/keyvaluestorage', import.meta.url),
        ),
      },
    },
    optimizeDeps: {
      include: ['validator'],
      esbuildOptions: {
        plugins: [
          {
            name: 'dep-compat',
            setup(build) {
              // porto is an optional @wagmi/connectors peer dep for the Porto wallet.
              // Not installed, and the app never instantiates the Porto connector.
              // Stub it out so esbuild inlines empty exports rather than leaving a
              // bare import in the pre-bundled chunk that would fail at runtime.
              build.onResolve({ filter: /^porto($|\/)/ }, () => ({
                path: 'porto-stub',
                namespace: 'porto-stub',
              }));
              build.onLoad({ filter: /.*/, namespace: 'porto-stub' }, () => ({
                contents: `export default {}; export const RpcSchema = {}; export const Porto = function() {}; export const z = {};`,
                loader: 'js',
              }));

              // @scure/bip32 and @scure/bip39 (root) use old @noble/hashes/_assert API
              // where exports were named `bytes`/`number`; they're now `abytes`/`anumber`.
              // Intercept only when the importer is a @scure package to avoid infinite loop.
              build.onResolve({ filter: /^@noble\/hashes\/_assert$/ }, (args) => {
                if (args.importer.includes('@scure')) {
                  return { path: 'noble-compat', namespace: 'noble-compat' };
                }
              });
              build.onLoad({ filter: /.*/, namespace: 'noble-compat' }, () => ({
                contents: `export { abytes as bytes, anumber as number, ahash, aexists, aoutput } from '@noble/hashes/_assert';`,
                resolveDir: frontendRoot,
              }));

              // @uniswap/v4-sdk (all versions) imports ethers v5's `constants` namespace.
              // Replace with a virtual module that sources values from ethers v6 via
              // resolveDir: frontendRoot, so pnpm copies can't accidentally fall back to
              // their own ethers v5.8.0 (whose ESM entry doesn't expose named constants).
              build.onResolve({ filter: /^virtual:uniswap-ethers-constants$/ }, () => ({
                path: 'uniswap-ethers-constants',
                namespace: 'uniswap-ethers-constants',
              }));
              build.onLoad({ filter: /.*/, namespace: 'uniswap-ethers-constants' }, () => ({
                contents: `
                  import { ZeroAddress } from 'ethers';
                  export const constants = { AddressZero: ZeroAddress };
                `,
                resolveDir: frontendRoot,
              }));
              build.onLoad(
                { filter: /\/@uniswap\/v4-sdk\/.*internalConstants\.js$/ },
                (args) => {
                  let source = readFileSync(args.path, 'utf8');
                  source = source.replace(
                    /import\s*\{\s*constants\s*\}\s*from\s*['"]ethers['"]/,
                    `import { constants } from 'virtual:uniswap-ethers-constants';`,
                  );
                  return { contents: source, loader: 'js' };
                },
              );
            },
          },
        ],
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api/uniswap-quote': {
          target: 'https://api.uniswap.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/uniswap-quote/, '/v2/quote'),
        },
      },
    },
  },
});
