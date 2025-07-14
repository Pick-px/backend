import {
  Entity,
  PrimaryColumn,
  Column,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Canvas } from './canvas.entity';
import { User } from 'src/user/entity/user.entity';

@Entity('canvas_history')
export class CanvasHistory {
  @PrimaryColumn({ name: 'canvas_id' })
  canvas_id: number;

  @Column({ type: 'int' })
  participant_count: number;

  @Column({ type: 'int' })
  attempt_count: number;

  @Column({ type: 'bigint' })
  top_participant_id: number;

  @Column({ type: 'bigint' })
  top_pixel_owner_id: number;

  @Column({ type: 'int' })
  top_participant_attempts: number;

  @Column({ type: 'int' })
  top_pixel_count: number;

  @OneToOne(() => Canvas)
  @JoinColumn({ name: 'canvas_id' })
  canvas: Canvas;

  @ManyToOne(() => User, (user) => user.top_participant_history)
  @JoinColumn({ name: 'top_participant_id' })
  top_participant: User;

  @ManyToOne(() => User, (user) => user.top_pixel_owner_history)
  @JoinColumn({ name: 'top_pixel_owner_id' })
  top_pixel_owner: User;
}
