import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('doctors')
  async search(
    @Query('q') q: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string
  ) {
    if (!q) {
      return [];
    }
    
    let location = undefined;
    if (lat && lng) {
      location = { lat: parseFloat(lat), lng: parseFloat(lng) };
    }

    return this.searchService.searchDoctors(q, location);
  }
}
