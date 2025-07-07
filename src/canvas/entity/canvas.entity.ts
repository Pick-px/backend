import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { UserCanvas } from '../../entity/UserCanvas.entity';
import { Group } from '../../group/entity/group.entity';
@Entity('canvases')
export class Canvas {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  title: string;

  @Column({
    type: 'text',
    enum: ['public', 'event'],
  })
  type: 'public' | 'event';

  @Column({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'ended_at', nullable: true })
  endedAt: Date;

  @Column({ name: 'size_x' })
  sizeX: number;

  @Column({ name: 'size_y' })
  sizeY: number;

  @Column({ type: 'boolean', name: 'is_active' })
  is_active: boolean;

  @OneToMany(() => UserCanvas, (uc) => uc.canvas)
  canvasUseres: UserCanvas[];

  @OneToMany(() => Group, (group) => group.canvas)
  groups: Group[];
}
