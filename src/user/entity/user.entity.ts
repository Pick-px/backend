import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { UserCanvas } from '../../entity/UserCanvas.entity';
import { Pixel } from '../../pixel/entity/pixel.entity';
import { GroupUser } from '../../entity/GroupUser.entity';
import { CanvasHistory } from '../../canvas/entity/canvasHistory.entity';
import { QuestionUser } from '../../game/entity/question_user.entity';
import { GameUserResult } from '../../game/entity/game_result.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'email', unique: true, nullable: false })
  email: string;

  @Column({ name: 'password', nullable: true, type: 'varchar', length: 100 })
  password: string | null;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'user_name' })
  userName: string;

  @Column({ name: 'role', type: 'varchar', length: 10, default: 'user' })
  role: 'admin' | 'user' | 'guest';

  @OneToMany(() => UserCanvas, (uc) => uc.user)
  userCanvases: UserCanvas[];

  @OneToMany(() => GroupUser, (gu) => gu.user)
  groupUsers: GroupUser[];

  @OneToMany(() => CanvasHistory, (history) => history.topTryUser)
  top_participant_history: CanvasHistory[];

  @OneToMany(() => CanvasHistory, (history) => history.topOwnUser)
  top_pixel_owner_history: CanvasHistory[];

  @OneToMany(() => QuestionUser, (qu) => qu.user)
  questionUsers: QuestionUser[];

  @OneToMany(() => GameUserResult, (gu) => gu.user)
  gameUserResults: GameUserResult[];

  @OneToMany(() => Pixel, (pixel) => pixel.ownerUser)
  ownedPixels: Pixel[];
}
