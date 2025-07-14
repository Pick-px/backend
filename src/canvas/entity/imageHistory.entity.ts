import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CanvasHistory } from './canvasHistory.entity';

@Entity('image_history')
export class ImageHistory {
  @PrimaryGeneratedColumn()
  id: number;

  //   @Column({ name: 'canvas_history_id', type: 'bigint' })
  //   canvas_history_id: number;

  @Column({ name: 'image_url', type: 'varchar', length: 1024 })
  image_url: string;

  @Column({ name: 'captured_at', type: 'timestamp' })
  captured_at: Date;

  @ManyToOne(() => CanvasHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'canvas_history_id' })
  canvasHistory: CanvasHistory;
}
