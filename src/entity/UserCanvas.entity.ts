import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { User } from '../user/entity/user.entity';
import { Canvas } from '../canvas/entity/canvas.entity';

@Entity('user_canvas')
export class UserCanvas {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.userCanvases)
  user: User;

  @ManyToOne(() => Canvas, (canvas) => canvas.canvasUseres)
  canvas: Canvas;

  @Column({ name: 'joined_at', type: 'timestamp' })
  joinedAt: Date;
}
