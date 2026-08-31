import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { HospitalController } from './hospital.controller';

import { SearchModule } from './search/search.module';
import { BookingModule } from './booking/booking.module';
import { NotificationModule } from './notification/notification.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [PrismaModule, AuthModule, SuperadminModule, SearchModule, BookingModule, NotificationModule, AdminModule],
  controllers: [HospitalController],
  providers: [],
})
export class AppModule {}
