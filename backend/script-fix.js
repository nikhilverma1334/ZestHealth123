const fs = require('fs');
let content = fs.readFileSync('websocket-security-check.js', 'utf8');
content = content.replace('console.log(\n--- Running Scenarios ---\n);', 'console.log(\n--- Running Scenarios ---\n);\n  try {');
content = content.replace('// Cleanup', '} finally {\n  console.log(\n--- Cleaning Up DB ---);\n  // Cleanup');
content = content.replace('await prisma.$disconnect();\n  process.exit(0);\n}', 'await prisma.$disconnect();\n  }\n  process.exit(0);\n}');
fs.writeFileSync('websocket-security-check.js', content);
