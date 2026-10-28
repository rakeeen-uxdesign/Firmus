import express from 'express';
import { getSubscriptions, replaceSubscriptions } from './features/subscriptions.js';

// The small HTTP API the web app talks to: it pushes Payit edits here so reminders stay current.

/** Starts listening; `onListening` runs once the port is open. */
export function startServer(port, onListening) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/subscriptions/sync', (req, res) => {
    if (Array.isArray(req.body)) {
      replaceSubscriptions(req.body);
      console.log(`🔄 Synced & saved ${req.body.length} Payit from the app`);
    }
    res.json({ status: 'ok', count: getSubscriptions().length });
  });

  return app.listen(port, onListening);
}
