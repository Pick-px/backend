import { Entity, Column, OneToMany, PrimaryColumn } from 'typeorm';
import { QuestionUser } from './question_user.entity';

@Entity('questions')
export class Question {
  @PrimaryColumn()
  id: number;

  @Column({ name: 'question', type: 'varchar', length: 200 })
  question: string;

  @Column({ name: 'options', type: 'text', array: true })
  options: string[];

  @Column({ name: 'answer', type: 'int' })
  answer: number;

  @OneToMany(() => QuestionUser, (qu) => qu.questions)
  questionUser: QuestionUser[];
}
