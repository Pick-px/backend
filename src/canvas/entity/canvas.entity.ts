import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { UserCanvas } from 'src/entity/UserCanvs.entity';
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

  @OneToMany(() => UserCanvas, (uc) => uc.canvas)
  canvasUseres: UserCanvas[];
}
