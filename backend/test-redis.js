require('dotenv').config();
const { createClient } = require('redis');
const client = createClient({ url: process.env.REDIS_URL, socket: { tls: process.env.REDIS_URL.startsWith('rediss://') } });
client.on('error', (e) => console.log('ERROR:', e));
client.connect().then(() => client.ping()).then(console.log).catch(console.error);