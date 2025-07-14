import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entity/user.entity';

@Entity('pixels')
export class Pixel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'canvas_id' })
  canvasId: number;

  @Column({ name: 'color' })
  color: string;

  @Column({ type: 'int', name: 'x' })
  x: number;

  @Column({ type: 'int', name: 'y' })
  y: number;

  @Column({ type: 'int', name: 'owner', nullable: true })
  owner: number | null;

  @Column({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'owner' })
  ownerUser: User;
}
