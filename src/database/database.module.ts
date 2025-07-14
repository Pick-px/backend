// src/database/database.module.ts
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';

@Module({
  providers: [
    {
      provide: 'DATA_SOURCE', // 토큰 문자열로 변경경
      useValue: AppDataSource,
    },
  ],
  exports: ['DATA_SOURCE'],
})
export class DatabaseModule {}
