require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');
const http = require('http');

const SECRET = 'ZestHealthSuperSecretKey_DoNotUseInProd';
const URL = 'http://localhost:3000';

async function run() {
  const prisma = new PrismaClient();
  
  console.log('--- Setting up DB ---');
  await prisma.staffRole.deleteMany({ where: { staffUser: { name: 'WS Test Admin' } } });
  await prisma.doctor.deleteMany({ where: { staffUser: { name: 'WS Test Admin' } } });
  await prisma.staffUser.deleteMany({ where: { name: 'WS Test Admin' } });

  const org = await prisma.hospitalOrg.create({ data: { name: 'WS Test Org' } });
  const branch1 = await prisma.branch.create({ data: { name: 'Branch 1', hospitalOrgId: org.id, address: 'Test' } });
  const branch2 = await prisma.branch.create({ data: { name: 'Branch 2', hospitalOrgId: org.id, address: 'Test' } });
  
  const staff = await prisma.staffUser.create({
    data: { name: 'WS Test Admin', phone: '+9999999', password: 'hash' }
  });
  
  const doctor = await prisma.doctor.create({
    data: { staffUserId: staff.id, specialties: ['WS'], qualifications: ['MD'] }
  });
  
  await prisma.staffRole.create({
    data: { staffUserId: staff.id, tenantId: org.id, branchId: branch1.id, role: 'BRANCH_RECEPTION' }
  });
  
  const patient = await prisma.patient.create({ data: { name: 'WS Patient', phone: '+88888888' }});
  
  console.log('--- DB Setup Complete ---');
  
  const validPayload = { sub: staff.id, roles: [{ role: 'BRANCH_RECEPTION', tenantId: org.id, branchId: branch1.id }] };
  const validToken = jwt.sign(validPayload, SECRET, { expiresIn: '1h' });
  const expiredToken = jwt.sign(validPayload, SECRET, { expiresIn: '-1h' });

  function connect(token, scenarioName) {
    return new Promise((resolve) => {
      const socket = io(URL, { auth: { token }, reconnection: false });
      let resolved = false;
      let stateLog = [];
      
      socket.on('connect', () => {
        stateLog.push('connect_emitted');
        // Wait a short bit because NestJS handleConnection might forcefully disconnect us a few ms later
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve({ socket, stateLog });
          }
        }, 500);
      });
      
      socket.on('disconnect', (reason) => {
        stateLog.push(`disconnect_emitted(${reason})`);
        if (!resolved) {
          resolved = true;
          resolve({ disconnected: true, reason, stateLog });
        }
      });
      
      socket.on('connect_error', (err) => {
        stateLog.push(`connect_error_emitted(${err.message})`);
        if (!resolved) {
          resolved = true;
          resolve({ error: err.message, stateLog });
        }
      });
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ error: 'timeout', stateLog });
        }
      }, 2000);
    });
  }

  console.log('\n--- Running Scenarios ---\n');
  try {

  // Scenario 1
  let s1 = await connect(null, 'Scenario 1');
  console.log('1. No Token: ', s1.disconnected ? `PASS (Disconnected: ${s1.reason})` : 'FAIL');

  // Scenario 2
  let s2 = await connect(expiredToken, 'Scenario 2');
  console.log(`   [Scenario 2 Debug] Observed events: ${s2.stateLog.join(' -> ')}`);
  console.log('2. Expired Token: ', s2.disconnected ? `PASS (Disconnected: ${s2.reason})` : 'FAIL');

  // Scenario 3
  let s3Data = await connect(validToken, 'Scenario 3');
  let s3Socket = s3Data.socket;
  let s3Result = await new Promise((resolve) => {
    s3Socket.on('error', (msg) => resolve(msg));
    s3Socket.emit('subscribe_queue', { tenantId: 'wrong-uuid', branchId: branch1.id });
    setTimeout(() => resolve('TIMEOUT'), 1000);
  });
  s3Socket.disconnect();
  console.log('3. Wrong Tenant: ', s3Result === 'Unauthorized to subscribe to this queue' ? 'PASS (Received Error Event)' : 'FAIL');

  // Scenario 4
  let s4Data = await connect(validToken, 'Scenario 4');
  let s4Socket = s4Data.socket;
  let s4Result = await new Promise((resolve) => {
    s4Socket.on('error', (msg) => resolve(msg));
    s4Socket.emit('subscribe_queue', { tenantId: org.id, branchId: branch2.id });
    setTimeout(() => resolve('TIMEOUT'), 1000);
  });
  s4Socket.disconnect();
  console.log('4. Wrong Branch: ', s4Result === 'Unauthorized to subscribe to this queue' ? 'PASS (Received Error Event)' : 'FAIL');

  // Scenario 5
  let s5Data = await connect(validToken, 'Scenario 5');
  let s5Socket = s5Data.socket;
  let s5Result = await new Promise((resolve) => {
    s5Socket.on('queue_update', (data) => resolve(data));
    s5Socket.emit('subscribe_queue', { tenantId: org.id, branchId: branch1.id });
    
    setTimeout(() => {
      // Trigger emergency insert to broadcast queue update
      const payload = JSON.stringify({
        patientId: patient.id,
        doctorId: doctor.id,
        branchId: branch1.id,
        date: new Date().toISOString(),
        timeSlot: '12:00',
        reason: 'WS test'
      });
      const req = http.request('http://localhost:3000/admin/emergency-insert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${validToken}`,
          'x-tenant-id': org.id
        }
      });
      req.write(payload);
      req.end();
    }, 500);
    
    setTimeout(() => resolve('TIMEOUT'), 5000);
  });
  s5Socket.disconnect();
  console.log('5. Valid Connection & Broadcast: ', s5Result.queueLength > 0 ? 'PASS (Received queue_update broadcast)' : 'FAIL');

  } finally {
  console.log('\n--- Cleaning Up DB ---');
  // Cleanup
  await prisma.notificationLog.deleteMany({ where: { appointment: { branchId: branch1.id } } });
  await prisma.appointment.deleteMany({ where: { branchId: branch1.id } });
  await prisma.patient.delete({ where: { id: patient.id } });
  await prisma.staffRole.deleteMany({ where: { staffUser: { name: 'WS Test Admin' } } });
  await prisma.doctor.deleteMany({ where: { staffUser: { name: 'WS Test Admin' } } });
  await prisma.staffUser.deleteMany({ where: { name: 'WS Test Admin' } });
  await prisma.branch.deleteMany({ where: { hospitalOrgId: org.id } });
  await prisma.hospitalOrg.delete({ where: { id: org.id } });
  
  await prisma.$disconnect();
  }
  process.exit(0);
}

run().catch(console.error);
