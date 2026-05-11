import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'api-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url && req.url.startsWith('/api/')) {
              const endpoint = req.url.split('?')[0].split('/')[2];
              try {
                // Use Vite's ssrLoadModule to correctly load and transpile the TS handler
                const modulePath = path.resolve(__dirname, `api/${endpoint}.ts`);
                const { default: handler } = await server.ssrLoadModule(modulePath);
                
                (res as any).status = (code: number) => {
                  res.statusCode = code;
                  return res;
                };
                (res as any).json = (data: any) => {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                  return res;
                };

                if (req.method === 'POST') {
                  let body = '';
                  req.on('data', chunk => {
                    body += chunk.toString();
                  });
                  req.on('end', async () => {
                    (req as any).body = JSON.parse(body || '{}');
                    await handler(req, res);
                  });
                } else {
                  await handler(req, res);
                }
                return;
              } catch (error) {
                console.error(`Error handling API route ${req.url}:`, error);
                next();
              }
            } else {
              next();
            }
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
