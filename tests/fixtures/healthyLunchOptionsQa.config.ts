// Dedicated localhost QA server; excluded from the application build/config.
import { defineConfig, mergeConfig } from 'vite';
import appConfig from '../../vite.config';
import { buildPendingOrder } from '../../functions/storePaymentsCore.js';

export default defineConfig(env => mergeConfig(appConfig(env), {
  plugins: [{ name:'healthy-lunch-local-qa', configureServer(server) {
    server.middlewares.use('/__healthy_lunch_qa_order', (request,response) => {
      if (request.method !== 'POST') { response.statusCode = 405; response.end(); return; }
      let body = '';
      request.on('data', chunk => { body += chunk; if (body.length > 1000000) request.destroy(); });
      request.on('end', () => {
        response.setHeader('Content-Type','application/json');
        try {
          const input = JSON.parse(body);
          const order = buildPendingOrder({ ...input,now:new Date('2026-10-16T04:00:00Z') });
          response.end(JSON.stringify(order));
        } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error:(error as Error).message })); }
      });
    });
  } }]
}));
