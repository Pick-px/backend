import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { QuestionUser } from '../game/entity/question_user.entity';

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'context', type: 'varchar', length: 200 })
  context: string;

  @Column({ name: 'answer', type: 'int' })
  answer: number;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @OneToMany(() => QuestionUser, (qu) => qu.questions)
  questionUser: QuestionUser;
}
