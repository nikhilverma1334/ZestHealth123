import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleMapsService } from '../maps/google-maps.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapsService: GoogleMapsService
  ) {}

  async searchDoctors(query: string, patientLocation?: { lat: number, lng: number }) {
    // 1. Keyword mapping (Symptom -> Specialty)
    const mappings = await this.prisma.specialtyMap.findMany({
      where: {
        keyword: {
          contains: query,
          mode: 'insensitive'
        }
      }
    });
    
    const mappedSpecialties = mappings.map(m => m.specialty);

    // 2. Search doctors by name or resolved specialty across ALL tenants
    // Note: No tenant restriction here as per requirements.
    const doctors = await this.prisma.doctor.findMany({
      where: {
        OR: [
          { staffUser: { name: { contains: query, mode: 'insensitive' } } },
          { specialties: { hasSome: mappedSpecialties.length > 0 ? mappedSpecialties : [query] } }
        ]
      },
      include: {
        staffUser: {
          select: { name: true }
        },
        doctorBranches: {
          include: {
            branch: {
              include: {
                hospitalOrg: { select: { name: true } }
              }
            }
          }
        },
        availabilities: {
          where: {
            date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
          },
          orderBy: {
            date: 'asc'
          }
        }
      }
    });

    // 3. Format and enrich with distance and next available slot
    let results = [];
    
    for (const doc of doctors) {
      for (const db of doc.doctorBranches) {
        // Find next available slot for this branch
        const nextSlot = doc.availabilities.find(a => a.branchId === db.branchId);
        
        results.push({
          doctorId: doc.id,
          name: doc.staffUser.name,
          specialties: doc.specialties,
          rating: doc.rating,
          hospital: db.branch.hospitalOrg.name,
          branchName: db.branch.name,
          branchAddress: db.branch.address,
          branchLat: db.branch.latitude,
          branchLng: db.branch.longitude,
          nextAvailableSlot: nextSlot ? `${nextSlot.date.toISOString().split('T')[0]} ${nextSlot.startTime}` : null,
          slotTimestamp: nextSlot ? new Date(`${nextSlot.date.toISOString().split('T')[0]}T${nextSlot.startTime}:00Z`).getTime() : Infinity,
          distanceValue: Infinity,
          durationText: ''
        });
      }
    }

    // 4. Calculate Distances
    if (patientLocation && results.length > 0) {
      const destinations = results.map(r => ({ lat: r.branchLat || 0, lng: r.branchLng || 0 }));
      const distances = await this.mapsService.getDistances(patientLocation, destinations);
      
      results = results.map((r, i) => {
        r.distanceValue = distances[i].distanceValue;
        r.durationText = distances[i].durationText;
        return r;
      });
    }

    // 5. Rank by soonest availability and distance
    results.sort((a, b) => {
      // First by availability
      if (a.slotTimestamp !== b.slotTimestamp) {
        return a.slotTimestamp - b.slotTimestamp;
      }
      // Then by distance
      return a.distanceValue - b.distanceValue;
    });

    return results;
  }
}
