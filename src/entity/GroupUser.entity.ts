import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { Group } from '../group/entity/group.entity';
import { User } from '../user/entity/user.entity';

@Entity('group_users')
export class GroupUser {
  @PrimaryGeneratedColumn()
  id: bigint;

  @ManyToOne(() => User, (user) => user.groupUsers)
  @JoinColumn({ name: 'user_id' })
  user: User;
  @ManyToOne(() => Group, (group) => group.groupUsers)
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ type: 'timestamp', name: 'joined_at' })
  join: Date;
}
