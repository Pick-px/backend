import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Canvas } from './canvas.entity';
import { User } from '../../user/entity/user.entity';

@Entity('canvas_history')
export class CanvasHistory {
  @PrimaryColumn({ name: 'canvas_id' })
  canvasId: number;

  @Column({ name: 'participant_count', type: 'integer', default: 0 })
  participantCount: number;

  @Column({ name: 'total_try_count', type: 'integer', default: 0 })
  totalTryCount: number;

  @Column({ name: 'top_try_user_id', type: 'bigint', nullable: true })
  topTryUserId: number | null;

  @Column({ name: 'top_try_user_count', type: 'integer', nullable: true })
  topTryUserCount: number | null;

  @Column({ name: 'top_own_user_id', type: 'bigint', nullable: true })
  topOwnUserId: number | null;

  @Column({ name: 'top_own_user_count', type: 'integer', nullable: true })
  topOwnUserCount: number | null;

  @ManyToOne(() => Canvas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'canvas_id' })
  canvas: Canvas;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'top_try_user_id' })
  topTryUser: User | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'top_own_user_id' })
  topOwnUser: User | null;
} 