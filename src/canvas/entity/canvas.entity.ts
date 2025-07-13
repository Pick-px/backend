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
    enum: ['public', 'event', 'game'],
  })
  type: 'public' | 'event' | 'game';

  @Column({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    name: 'started_at',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  startedAt: Date;

  @Column({ type: 'timestamp', name: 'ended_at', nullable: true })
  endedAt: Date;

  @Column({ name: 'size_x' })
  sizeX: number;

  @Column({ name: 'size_y' })
  sizeY: number;

  @Column({ name: 'url' })
  url: string;

  @OneToMany(() => UserCanvas, (uc) => uc.canvas)
  canvasUseres: UserCanvas[];

  @OneToMany(() => Group, (group) => group.canvas)
  groups: Group[];
}
