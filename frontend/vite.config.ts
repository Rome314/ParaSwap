import { defineOpenZeppelinAdapterViteConfig } from '@openzeppelin/adapters-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineOpenZeppelinAdapterViteConfig({
  ecosystems: ['evm'],
  config: {
    plugins: [tailwindcss(), react()],
    optimizeDeps: {
      include: ['validator'],
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
