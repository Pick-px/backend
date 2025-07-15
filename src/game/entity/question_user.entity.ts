import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entity/user.entity';
import { Question } from './questions.entity';

@Entity('question_user')
export class QuestionUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'question_id', type: 'bigint' })
  questionId: number;

  @Column({ name: 'canvas_id', type: 'bigint' })
  canvasId: number;

  @Column({ name: 'submitted_answer', type: 'int' })
  answer: number;

  @Column({ name: 'is_correct', type: 'boolean', default: false })
  isCorrect: boolean;

  @Column({
    name: 'submitted_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  submittedAt: Date;

  @ManyToOne(() => User, (user) => user.questionUsers)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Question, (qu) => qu.questionUser)
  @JoinColumn({ name: 'question_id' })
  questions: Question;
}
