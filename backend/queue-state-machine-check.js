require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');
const http = require('http');

const SECRET = 'ZestHealthSuperSecretKey_DoNotUseInProd';
const URL = 'http://localhost:3000';

function makeRequest(path, method, payload, token, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function connect(token, roomOptions) {
  return new Promise((resolve) => {
    const socket = io(URL, { auth: { token }, reconnection: false });
    let resolved = false;
    let events = [];
    
    socket.on('connect', () => {
      if (roomOptions) {
        socket.emit('subscribe_queue', roomOptions);
      }
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ socket, events });
        }
      }, 800);
    });
    
    socket.on('queue_update', (data) => events.push(data));
  });
}

async function run() {
  const prisma = new PrismaClient();
  
  console.log('--- Setting up DB ---');
  // cleanup first
  await prisma.notificationLog.deleteMany({ where: { appointment: { patient: { name: { startsWith: 'QS Patient' } } } } });
  await prisma.appointment.deleteMany({ where: { patient: { name: { startsWith: 'QS Patient' } } } });
  await prisma.doctorAvailability.deleteMany({ where: { doctor: { staffUser: { name: { startsWith: 'QS Admin' } } } } });
  await prisma.staffRole.deleteMany({ where: { staffUser: { name: { startsWith: 'QS Admin' } } } });
  await prisma.doctor.deleteMany({ where: { staffUser: { name: { startsWith: 'QS Admin' } } } });
  await prisma.staffUser.deleteMany({ where: { name: { startsWith: 'QS Admin' } } });
  await prisma.patient.deleteMany({ where: { name: { startsWith: 'QS Patient' } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: 'QS Branch' } } });
  await prisma.hospitalOrg.deleteMany({ where: { name: { startsWith: 'QS Org' } } });

  const orgA = await prisma.hospitalOrg.create({ data: { name: 'QS Org A' } });
  const branchA = await prisma.branch.create({ data: { name: 'QS Branch A', hospitalOrgId: orgA.id, address: 'Test' } });
  const staffA = await prisma.staffUser.create({ data: { name: 'QS Admin A', phone: '+9999991', password: 'hash' } });
  const doctorA = await prisma.doctor.create({ data: { staffUserId: staffA.id, specialties: ['QS'], qualifications: ['MD'] } });
  await prisma.staffRole.create({ data: { staffUserId: staffA.id, tenantId: orgA.id, branchId: branchA.id, role: 'BRANCH_RECEPTION' } });

  const orgB = await prisma.hospitalOrg.create({ data: { name: 'QS Org B' } });
  const branchB = await prisma.branch.create({ data: { name: 'QS Branch B', hospitalOrgId: orgB.id, address: 'Test' } });
  const staffB = await prisma.staffUser.create({ data: { name: 'QS Admin B', phone: '+9999992', password: 'hash' } });
  const doctorB = await prisma.doctor.create({ data: { staffUserId: staffB.id, specialties: ['QS'], qualifications: ['MD'] } });
  await prisma.staffRole.create({ data: { staffUserId: staffB.id, tenantId: orgB.id, branchId: branchB.id, role: 'BRANCH_RECEPTION' } });

  const pA1 = await prisma.patient.create({ data: { name: 'QS Patient A1', phone: '+8888881' }});
  const pA2 = await prisma.patient.create({ data: { name: 'QS Patient A2', phone: '+8888882' }});
  const pB1 = await prisma.patient.create({ data: { name: 'QS Patient B1', phone: '+8888883' }});
  const pB2 = await prisma.patient.create({ data: { name: 'QS Patient B2', phone: '+8888884' }});

  const today = new Date();
  today.setHours(0,0,0,0);
  await prisma.doctorAvailability.create({ 
    data: { 
      doctorId: doctorA.id, 
      branchId: branchA.id, 
      date: today, 
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 30,
      maxPatientsPerSlot: 10 
    } 
  });
  await prisma.doctorAvailability.create({ 
    data: { 
      doctorId: doctorB.id, 
      branchId: branchB.id, 
      date: today, 
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 30,
      maxPatientsPerSlot: 10 
    } 
  });

  const staffTokenA = jwt.sign({ sub: staffA.id, roles: [{ role: 'BRANCH_RECEPTION', tenantId: orgA.id, branchId: branchA.id }] }, SECRET, { expiresIn: '1h' });
  const staffTokenB = jwt.sign({ sub: staffB.id, roles: [{ role: 'BRANCH_RECEPTION', tenantId: orgB.id, branchId: branchB.id }] }, SECRET, { expiresIn: '1h' });
  const pTokenA1 = jwt.sign({ sub: pA1.id, role: 'PATIENT' }, SECRET, { expiresIn: '1h' });
  const pTokenA2 = jwt.sign({ sub: pA2.id, role: 'PATIENT' }, SECRET, { expiresIn: '1h' });
  const pTokenB1 = jwt.sign({ sub: pB1.id, role: 'PATIENT' }, SECRET, { expiresIn: '1h' });
  const pTokenB2 = jwt.sign({ sub: pB2.id, role: 'PATIENT' }, SECRET, { expiresIn: '1h' });

  // Book
  const bookA1 = await makeRequest('/booking/book', 'POST', { doctorId: doctorA.id, branchId: branchA.id, date: today, timeSlot: '12:00', reason: 'QS Test', patientId: pA1.id }, staffTokenA, { 'x-tenant-id': orgA.id });
  const bookA2 = await makeRequest('/booking/book', 'POST', { doctorId: doctorA.id, branchId: branchA.id, date: today, timeSlot: '12:00', reason: 'QS Test', patientId: pA2.id }, staffTokenA, { 'x-tenant-id': orgA.id });
  const bookB1 = await makeRequest('/booking/book', 'POST', { doctorId: doctorB.id, branchId: branchB.id, date: today, timeSlot: '12:00', reason: 'QS Test', patientId: pB1.id }, staffTokenB, { 'x-tenant-id': orgB.id });
  const bookB2 = await makeRequest('/booking/book', 'POST', { doctorId: doctorB.id, branchId: branchB.id, date: today, timeSlot: '12:00', reason: 'QS Test', patientId: pB2.id }, staffTokenB, { 'x-tenant-id': orgB.id });

  if (bookA1.status >= 400 || bookA2.status >= 400 || bookB1.status >= 400 || bookB2.status >= 400) {
    console.error('Failed to book appointments:', bookA1.body, bookA2.body, bookB1.body, bookB2.body);
    process.exit(1);
  }

  console.log('--- Connecting Sockets ---');
  const wsStaffA = await connect(staffTokenA, { tenantId: orgA.id, branchId: branchA.id });
  const wsStaffB = await connect(staffTokenB, { tenantId: orgB.id, branchId: branchB.id });
  const wsPA1 = await connect(pTokenA1);
  const wsPA2 = await connect(pTokenA2);
  const wsPB1 = await connect(pTokenB1);
  const wsPB2 = await connect(pTokenB2);

  // Give an extra 500ms safety buffer for all sockets to be ready
  await new Promise(r => setTimeout(r, 500));

  const allClients = [wsStaffA, wsStaffB, wsPA1, wsPA2, wsPB1, wsPB2];
  
  function clearEvents() {
    allClients.forEach(c => c.events.length = 0);
  }

  try {
    console.log('\nStep 1: Check-in (Tenant A)');
    clearEvents();
    await makeRequest('/queue/update-status', 'POST', { appointmentId: bookA1.body.id, status: 'IN_QUEUE', lat: 12.9, lng: 77.5 }, staffTokenA, { 'x-tenant-id': orgA.id });
    await new Promise(r => setTimeout(r, 800)); // wait for broadcast
    
    console.log('  Staff A events:', JSON.stringify(wsStaffA.events, null, 2));
    console.log('  Patient A1 events:', JSON.stringify(wsPA1.events, null, 2));
    console.log('  Patient A2 events:', JSON.stringify(wsPA2.events, null, 2));
    console.log('  Staff B events (isolation check):', wsStaffB.events.length);
    
    let pass1 = wsStaffA.events.length > 0 && wsPA1.events.length > 0 && wsPA2.events.length > 0 && wsStaffB.events.length === 0 && wsPB1.events.length === 0;
    console.log(pass1 ? '  PASS' : '  FAIL (Expected Staff A > 0, PA1 > 0, PA2 > 0, Staff B === 0)');

    console.log('\nStep 2: Consultation Started (Tenant A)');
    clearEvents();
    await makeRequest('/queue/update-status', 'POST', { appointmentId: bookA1.body.id, status: 'IN_CONSULTATION' }, staffTokenA, { 'x-tenant-id': orgA.id });
    await new Promise(r => setTimeout(r, 800));
    
    console.log('  Staff A events:', JSON.stringify(wsStaffA.events, null, 2));
    console.log('  Patient A1 events:', JSON.stringify(wsPA1.events, null, 2));
    console.log('  Staff B events (isolation check):', wsStaffB.events.length);
    
    let pass2 = wsStaffA.events.length > 0 && wsPA1.events[0]?.etaSeconds === 0 && wsStaffB.events.length === 0;
    console.log(pass2 ? '  PASS' : '  FAIL (Expected Staff A > 0, PA1 etaSeconds === 0, Staff B === 0)');

    console.log('\nStep 3: No-Show (Tenant B)');
    clearEvents();
    await makeRequest('/queue/update-status', 'POST', { appointmentId: bookB1.body.id, status: 'NO_SHOW' }, staffTokenB, { 'x-tenant-id': orgB.id });
    await new Promise(r => setTimeout(r, 800));
    
    console.log('  Staff B events:', JSON.stringify(wsStaffB.events, null, 2));
    console.log('  Patient B2 events:', JSON.stringify(wsPB2.events, null, 2));
    console.log('  Staff A events (isolation check):', wsStaffA.events.length);
    
    let pass3 = wsStaffB.events.length > 0 && wsPB2.events.length > 0 && wsStaffA.events.length === 0 && wsPA1.events.length === 0;
    console.log(pass3 ? '  PASS' : '  FAIL (Expected Staff B > 0, PB2 > 0, Staff A === 0)');

    console.log('\nStep 4: Patient-Initiated Cancellation (Tenant A)');
    clearEvents();
    await makeRequest('/booking/cancel', 'POST', { appointmentId: bookA2.body.id, reason: 'Test' }, pTokenA2);
    await new Promise(r => setTimeout(r, 800));
    
    console.log('  Staff A events:', JSON.stringify(wsStaffA.events, null, 2));
    console.log('  Staff B events (isolation check):', wsStaffB.events.length);
    
    let pass4 = wsStaffA.events.length > 0 && wsStaffB.events.length === 0;
    console.log(pass4 ? '  PASS' : '  FAIL (Expected Staff A > 0, Staff B === 0)');

  } finally {
    console.log('\n--- Cleaning Up Sockets and DB ---');
    allClients.forEach(c => c.socket.disconnect());
    await new Promise(r => setTimeout(r, 500));
    
    await prisma.notificationLog.deleteMany({ where: { appointment: { patient: { name: { startsWith: 'QS Patient' } } } } });
    await prisma.appointment.deleteMany({ where: { patient: { name: { startsWith: 'QS Patient' } } } });
    await prisma.doctorAvailability.deleteMany({ where: { doctor: { staffUser: { name: { startsWith: 'QS Admin' } } } } });
    await prisma.staffRole.deleteMany({ where: { staffUser: { name: { startsWith: 'QS Admin' } } } });
    await prisma.doctor.deleteMany({ where: { staffUser: { name: { startsWith: 'QS Admin' } } } });
    await prisma.staffUser.deleteMany({ where: { name: { startsWith: 'QS Admin' } } });
    await prisma.patient.deleteMany({ where: { name: { startsWith: 'QS Patient' } } });
    await prisma.branch.deleteMany({ where: { name: { startsWith: 'QS Branch' } } });
    await prisma.hospitalOrg.deleteMany({ where: { name: { startsWith: 'QS Org' } } });
    
    await prisma.$disconnect();
  }
}
run().catch(console.error);
