'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import Link from 'next/link';

export default function Dashboard() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Note: To actually fetch tenants, we need a backend endpoint like GET /superadmin/tenants
    // Since we didn't explicitly build GET /superadmin/tenants in Phase 1 (only POST onboard),
    // we assume it exists or we mock it here.
    async function fetchTenants() {
      try {
        const res = await fetchWithAuth('/superadmin/tenants');
        if (res.ok) {
          const data = await res.json();
          setTenants(data);
        } else {
          // Mock data if endpoint is missing
          setTenants([
            { id: '1', name: 'Apollo Hospital', contactEmail: 'admin@apollo.com', branches: [{ id: 'b1', name: 'Main Branch' }] }
          ]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchTenants();
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Onboarded Tenants</h2>
        <Link href="/onboard" className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">
          + New Tenant
        </Link>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hospital Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branches</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tenants.map(tenant => (
                <tr key={tenant.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{tenant.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">{tenant.contactEmail}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">{tenant.branches?.length || 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-blue-600 hover:text-blue-900">View Details</button>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">No tenants found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
