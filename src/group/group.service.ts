import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './entity/group.entity';
import { Chat } from './entity/chat.entity';

@Injectable()
export class GroupService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
  ) {}

  async getGroupIdByCanvasId(canvasId: number): Promise<number | null> {
    const group = await this.groupRepository.findOne({ where: { canvasId } });
    return group ? group.id : null;
  }

  async getRecentChatsByGroupId(groupId: number): Promise<Chat[]> {
    return this.groupRepository.manager.find(Chat, {
      where: { groupId },
      order: { createdAt: 'DESC' },
      take: 50,
      relations: ['user'],
    });
  }
}
