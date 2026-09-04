const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function clean() {
  const res = await prisma.patient.deleteMany({ where: { phone: { startsWith: '+2' } } });
  console.log('Cleaned up stranded test patients:', res.count);
}
clean().finally(() => prisma.$disconnect());
