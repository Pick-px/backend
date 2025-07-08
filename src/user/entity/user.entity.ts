import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { UserCanvas } from '../../entity/UserCanvas.entity';
import { GroupUser } from '../../entity/GroupUser.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'email', unique: true, nullable: false })
  email: string;

  @Column({ name: 'password', nullable: true })
  password: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'user_name' })
  userName: string;

  @OneToMany(() => UserCanvas, (uc) => uc.user)
  userCanvases: UserCanvas[];

  @OneToMany(() => GroupUser, (gu) => gu.user)
  groupUsers: GroupUser[];
}
