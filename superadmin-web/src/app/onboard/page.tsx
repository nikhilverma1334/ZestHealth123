'use client';

import { useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function OnboardTenant() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    orgName: '',
    orgEmail: '',
    branchName: '',
    branchAddress: '',
    branchLat: '',
    branchLng: '',
    adminName: '',
    adminPhone: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        orgName: formData.orgName,
        orgEmail: formData.orgEmail,
        branchName: formData.branchName,
        branchAddress: formData.branchAddress,
        latitude: parseFloat(formData.branchLat) || 0,
        longitude: parseFloat(formData.branchLng) || 0,
        adminName: formData.adminName,
        adminPhone: formData.adminPhone
      };

      const res = await fetchWithAuth('/superadmin/onboard', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to onboard tenant');
      }

      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Onboard New Hospital Tenant</h2>
      
      {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Hospital Org Section */}
        <div>
          <h3 className="text-lg font-semibold border-b pb-2 mb-4">1. Organization Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Hospital Name</label>
              <input required name="orgName" value={formData.orgName} onChange={handleChange} className="mt-1 w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Contact Email</label>
              <input required type="email" name="orgEmail" value={formData.orgEmail} onChange={handleChange} className="mt-1 w-full border rounded p-2" />
            </div>
          </div>
        </div>

        {/* Initial Branch Section */}
        <div>
          <h3 className="text-lg font-semibold border-b pb-2 mb-4">2. Main Branch</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">Branch Name</label>
              <input required name="branchName" value={formData.branchName} onChange={handleChange} className="mt-1 w-full border rounded p-2" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">Address</label>
              <input required name="branchAddress" value={formData.branchAddress} onChange={handleChange} className="mt-1 w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Latitude</label>
              <input required type="number" step="any" name="branchLat" value={formData.branchLat} onChange={handleChange} className="mt-1 w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Longitude</label>
              <input required type="number" step="any" name="branchLng" value={formData.branchLng} onChange={handleChange} className="mt-1 w-full border rounded p-2" />
            </div>
          </div>
        </div>

        {/* Initial Admin Section */}
        <div>
          <h3 className="text-lg font-semibold border-b pb-2 mb-4">3. Administrator Account</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Admin Name</label>
              <input required name="adminName" value={formData.adminName} onChange={handleChange} className="mt-1 w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input required name="adminPhone" value={formData.adminPhone} onChange={handleChange} className="mt-1 w-full border rounded p-2" />
            </div>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Onboarding...' : 'Onboard Tenant'}
        </button>
      </form>
    </div>
  );
}
