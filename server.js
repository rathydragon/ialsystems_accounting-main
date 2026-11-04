// Entry file for Hostinger (Node.js web app): starts the backend, which also serves the built frontend from dist/.
process.env.NODE_ENV ||= 'production';
await import('./backend/server.js');
