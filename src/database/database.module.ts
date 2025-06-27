// src/database/database.module.ts
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';

@Module({
  providers: [
    {
      provide: DataSource,
      useValue: AppDataSource,
    },
  ],
  exports: [DataSource],
})
export class DatabaseModule {}
