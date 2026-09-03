import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchDoctorsDto } from './search.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('doctors')
  async search(
    @Query() query: SearchDoctorsDto
  ) {
    if (!query.q) {
      return [];
    }
    
    let location = undefined;
    if (query.lat !== undefined && query.lng !== undefined) {
      location = { lat: query.lat, lng: query.lng };
    }

    return this.searchService.searchDoctors(query.q, location);
  }
}
