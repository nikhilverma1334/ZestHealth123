const fs = require('fs');
let content = fs.readFileSync('test/booking-flow.e2e-spec.ts', 'utf8');
content = content.replace(/\\Bearer \\\\/g, '\Bearer \\');
fs.writeFileSync('test/booking-flow.e2e-spec.ts', content);
