import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { UserCanvas } from '../../entity/UserCanvas.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'email' })
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
}
