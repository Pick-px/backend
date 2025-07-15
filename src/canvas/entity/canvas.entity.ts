import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { UserCanvas } from '../../entity/UserCanvas.entity';
import { Group } from '../../group/entity/group.entity';
import { GameUserResult } from '../../game/entity/game_result.entity';
import { CanvasHistory } from './canvasHistory.entity';
@Entity('canvases')
export class Canvas {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  title: string;

  @Column({
    type: 'text',
    enum: ['public', 'event_common', 'event_colorlimit', 'game_calculation'],
  })
  type: 'public' | 'event_common' | 'event_colorlimit' | 'game_calculation';

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

  @OneToOne(() => CanvasHistory, (ch) => ch.canvas)
  canvasHistory: CanvasHistory;

  @OneToMany(() => GameUserResult, (gu) => gu.canvas)
  gameUserResults: GameUserResult[];

  @OneToMany(() => UserCanvas, (uc) => uc.canvas)
  canvasUseres: UserCanvas[];

  @OneToMany(() => Group, (group) => group.canvas)
  groups: Group[];
}
