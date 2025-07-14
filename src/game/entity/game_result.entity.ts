import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Canvas } from '../../canvas/entity/canvas.entity';
import { User } from '../../user/entity/user.entity';

@Entity('game_user_result')
export class GameUserResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'canvas_id', type: 'bigint' })
  canvasId: number;

  @Column({ name: 'rank', type: 'int' })
  rank: number;

  @Column({ name: 'assigned_color', type: 'varchar' })
  color: string;

  @Column({ name: 'life', type: 'int', default: 2 })
  life: number;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.gameUserResults)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Canvas, (canvas) => canvas.gameUserResults)
  @JoinColumn({ name: 'canvas_id' })
  canvas: Canvas;
}
