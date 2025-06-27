import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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

  @Column({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;
}
