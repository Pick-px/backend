import { Entity, PrimaryGeneratedColumn, ManyToOne, Column, Unique, JoinColumn } from 'typeorm';
import { Group } from '../group/entity/group.entity';
import { User } from '../user/entity/user.entity';

@Entity('group_users')
@Unique(['group', 'user'])
export class GroupUser {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'joined_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  joinedAt: Date;
} 