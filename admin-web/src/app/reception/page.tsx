'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useSocket } from '@/components/SocketProvider';

export default function ReceptionDashboard() {
  const socket = useSocket();
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dummy IDs for the demo - in a real app, reception would select the doctor/branch from a dropdown
  const doctorId = 'mock-doctor-id';
  const branchId = 'mock-branch-id';
  const today = new Date().toISOString().split('T')[0];

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/admin/queue?doctorId=${doctorId}&branchId=${branchId}&date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setQueue(data);
      }
    } catch (err) {
      console.error('Failed to fetch queue', err);
    } finally {
      setLoading(false);
    }
  }, [doctorId, branchId, today]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    if (!socket) return;
    
    const handleQueueUpdate = () => {
      // Re-fetch the entire queue to keep UI simple and consistent
      fetchQueue();
    };

    socket.on('queue_update', handleQueueUpdate);
    return () => {
      socket.off('queue_update', handleQueueUpdate);
    };
  }, [socket, fetchQueue]);

  const updateStatus = async (appointmentId: string, status: string) => {
    try {
      await fetchWithAuth('/queue/update-status', {
        method: 'POST',
        body: JSON.stringify({ appointmentId, status })
      });
      fetchQueue();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const handleEmergencyInsert = async () => {
    const reason = prompt('Enter emergency reason (required):');
    if (!reason || reason.trim() === '') {
      alert('Reason is required for emergency insertion');
      return;
    }
    
    try {
      const res = await fetchWithAuth('/admin/emergency-insert', {
        method: 'POST',
        body: JSON.stringify({
          patientId: 'mock-patient-id', // Would normally select an existing patient
          doctorId,
          branchId,
          date: today,
          timeSlot: '09:00', // Mock time slot
          reason
        })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        alert(errData.message || 'Emergency insertion failed');
      } else {
        fetchQueue();
      }
    } catch (err) {
      alert('Network error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Reception Dashboard</h1>
          <div className="space-x-4">
            <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
              Register Walk-in
            </button>
            <button onClick={handleEmergencyInsert} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
              Emergency Insert
            </button>
          </div>
        </div>

        <div className="bg-white rounded shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && <tr><td colSpan={5} className="p-4 text-center">Loading queue...</td></tr>}
              {!loading && queue.length === 0 && <tr><td colSpan={5} className="p-4 text-center">No patients in queue</td></tr>}
              {queue.map((apt) => (
                <tr key={apt.id} className={apt.status === 'IN_CONSULTATION' ? 'bg-blue-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">{apt.tokenNumber}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-700">{apt.patient?.name || 'Unknown'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${apt.status === 'BOOKED' ? 'bg-yellow-100 text-yellow-800' : ''}
                      ${apt.status === 'IN_QUEUE' ? 'bg-purple-100 text-purple-800' : ''}
                      ${apt.status === 'IN_CONSULTATION' ? 'bg-blue-100 text-blue-800' : ''}
                      ${apt.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : ''}
                      ${apt.status === 'CANCELLED' || apt.status === 'NO_SHOW' ? 'bg-red-100 text-red-800' : ''}
                    `}>
                      {apt.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {apt.priority > 0 ? <span className="text-red-600 font-bold">EMERGENCY</span> : 'Normal'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    {apt.status === 'BOOKED' && (
                      <button onClick={() => updateStatus(apt.id, 'IN_QUEUE')} className="text-indigo-600 hover:text-indigo-900">Check-in</button>
                    )}
                    {(apt.status === 'BOOKED' || apt.status === 'IN_QUEUE') && (
                      <button onClick={() => updateStatus(apt.id, 'NO_SHOW')} className="text-red-600 hover:text-red-900">No Show</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
