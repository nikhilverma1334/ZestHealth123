'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useSocket } from '@/components/SocketProvider';

export default function DoctorDashboard() {
  const socket = useSocket();
  const [queue, setQueue] = useState<any[]>([]);
  
  // Dummy IDs for the demo - in a real app, doctor ID comes from JWT
  const doctorId = 'mock-doctor-id';
  const branchId = 'mock-branch-id';
  const today = new Date().toISOString().split('T')[0];

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/admin/queue?doctorId=${doctorId}&branchId=${branchId}&date=${today}`);
      if (res.ok) {
        const data = await res.json();
        // Filter out completed/cancelled for doctor's focused view
        setQueue(data.filter((a: any) => !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status)));
      }
    } catch (err) {
      console.error('Failed to fetch queue', err);
    }
  }, [doctorId, branchId, today]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    if (!socket) return;
    
    const handleQueueUpdate = () => fetchQueue();

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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Doctor's Active Queue</h1>

        <div className="space-y-4">
          {queue.map((apt) => (
            <div key={apt.id} className={`p-6 rounded-lg shadow-sm border-l-4 bg-white flex justify-between items-center
              ${apt.status === 'IN_CONSULTATION' ? 'border-blue-500' : 
                apt.priority > 0 ? 'border-red-500' : 'border-gray-200'}`}>
              
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-2xl font-black text-gray-900">#{apt.tokenNumber}</span>
                  {apt.priority > 0 && <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded">EMERGENCY</span>}
                </div>
                <h3 className="text-xl font-semibold text-gray-800">{apt.patient?.name || 'Unknown Patient'}</h3>
                <p className="text-gray-500 text-sm mt-1">Status: {apt.status}</p>
              </div>

              <div className="space-x-3">
                {apt.status === 'IN_QUEUE' && (
                  <button 
                    onClick={() => updateStatus(apt.id, 'IN_CONSULTATION')}
                    className="bg-blue-600 text-white px-6 py-3 rounded-md font-semibold hover:bg-blue-700"
                  >
                    Start Consultation
                  </button>
                )}
                {apt.status === 'IN_CONSULTATION' && (
                  <button 
                    onClick={() => updateStatus(apt.id, 'COMPLETED')}
                    className="bg-green-600 text-white px-6 py-3 rounded-md font-semibold hover:bg-green-700"
                  >
                    Finish Consultation
                  </button>
                )}
              </div>

            </div>
          ))}

          {queue.length === 0 && (
            <div className="text-center p-12 bg-white rounded-lg border border-dashed">
              <p className="text-gray-500 text-lg">No active patients in your queue.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
