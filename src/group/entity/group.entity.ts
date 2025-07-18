import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Canvas } from '../../canvas/entity/canvas.entity';
import { GroupUser } from '../../entity/GroupUser.entity';

@Unique(['id', 'name'])
@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  name: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'max_participants', type: 'int' })
  maxParticipants: number;

  @Column({ name: 'current_participants_count', type: 'int', default: 1 })
  currentParticipantsCount: number;

  @Column({ name: 'canvas_id', type: 'bigint' })
  canvasId: number;

  @Column({ name: 'made_by', type: 'bigint' })
  madeBy: number;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  is_default: boolean;

  @Column({ name: 'url', type: 'varchar', default: null })
  url: string;

  @Column({ name: 'overlay_x', type: 'decimal', default: 0.0 })
  x: number;

  @Column({ name: 'overlay_y', type: 'decimal', default: 0.0 })
  y: number;

  @Column({ name: 'overlay_height', type: 'decimal', default: 0.0 })
  height: number;

  @Column({ name: 'overlay_width', type: 'decimal', default: 0.0 })
  width: number;

  @ManyToOne(() => Canvas, (canvas) => canvas.groups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'canvas_id' })
  canvas: Canvas;

  @OneToMany(() => GroupUser, (gu) => gu.group)
  groupUsers: GroupUser[];
}
