'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SocketContext = createContext<Socket | null>(null);

export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Rely on httpOnly cookies automatically sent by the browser
    const socketInstance = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000', {
      withCredentials: true,
      transports: ['websocket', 'polling'], // Fallback to polling if websocket fails due to CORS
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      // Backend should extract tenantId and branchId from the httpOnly JWT cookie
      socketInstance.emit('subscribe_queue', { /* IDs inferred from JWT by server */ });
    });

    // Handle token expiry warning
    socketInstance.on('token_expiring', async (data) => {
      console.log('Token expiring soon, silently refreshing...', data?.message);
      try {
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, { 
          method: 'POST',
          credentials: 'include' 
        });
        if (res.ok) {
          // Re-connect to re-validate new cookie in handshake
          socketInstance.disconnect().connect();
        } else {
          window.location.href = '/login';
        }
      } catch (err) {
        console.error('Silent refresh failed via socket event', err);
      }
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}
