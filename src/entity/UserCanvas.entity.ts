import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/entity/user.entity';
import { Canvas } from '../canvas/entity/canvas.entity';

@Entity('user_canvas')
export class UserCanvas {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.userCanvases)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Canvas, (canvas) => canvas.canvasUseres)
  @JoinColumn({ name: 'canvas_id' })
  canvas: Canvas;

  @Column({ name: 'try_count', type: 'integer', default: 0 })
  tryCount: number;

  @Column({ name: 'own_count', type: 'integer', nullable: true })
  ownCount: number | null;

  @Column({ name: 'joined_at', type: 'timestamp' })
  joinedAt: Date;
}
