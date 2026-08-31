import { Injectable } from '@nestjs/common';

@Injectable()
export class GoogleMapsService {
  // Mocking the Distance Matrix API for development
  // In production, we'd use @googlemaps/google-maps-services-js
  async getDistances(origin: { lat: number, lng: number }, destinations: { lat: number, lng: number }[]) {
    // Return mock distances and times
    return destinations.map(dest => {
      // Basic euclidean mock distance just for demo sorting
      const latDiff = origin.lat - dest.lat;
      const lngDiff = origin.lng - dest.lng;
      const distanceDegrees = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      const distanceKm = distanceDegrees * 111; // rough approx
      
      return {
        distanceValue: Math.round(distanceKm * 1000), // in meters
        distanceText: `${distanceKm.toFixed(1)} km`,
        durationValue: Math.round(distanceKm * 2 * 60), // assume 30km/h -> 2 min per km
        durationText: `${Math.round(distanceKm * 2)} mins`,
      };
    });
  }
}
