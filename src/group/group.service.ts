import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './entity/group.entity';
import { Chat } from './entity/chat.entity';
import { GroupUser } from '../entity/GroupUser.entity';
import { User } from '../user/entity/user.entity';

@Injectable()
export class GroupService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupUser)
    private readonly groupUserRepository: Repository<GroupUser>,
  ) {}

  // 그룹 ID로 최근 채팅 목록(최대 take개, 기본 50개)을 반환
  async getRecentChatsByGroupId(groupId: number, take: number = 50): Promise<Chat[]> {
    return this.groupRepository.manager.find(Chat, {
      where: { groupId },
      order: { createdAt: 'DESC' },
      take,
      relations: ['user'],
    });
  }

  // 특정 유저가 참여 중인 모든 그룹을 반환
  async findGroupsByUserId(userId: number): Promise<Group[]> {
    const groupUsers = await this.groupUserRepository.find({
      where: { user: { id: userId } },
      relations: ['group'],
    });
    return groupUsers.map(gu => gu.group);
  }

  // 캔버스 ID로 해당 캔버스의 모든 그룹을 반환
  async findGroupsByCanvasId(canvasId: number): Promise<Group[]> {
    return this.groupRepository.find({ where: { canvasId } });
  }

  // 캔버스 ID로 전체 채팅방(기본 그룹, is_default=true) 반환
  async findDefaultGroupByCanvasId(canvasId: number): Promise<Group | null> {
    return this.groupRepository.findOne({ where: { canvasId, is_default: true } });
  }

  // 그룹 ID로 그룹 엔티티 반환
  async findGroupById(groupId: number): Promise<Group | null> {
    return this.groupRepository.findOne({ where: { id: groupId } });
  }

  // 유저가 해당 그룹에 속해있는지 여부 반환
  async isUserInGroup(userId: number, groupId: number): Promise<boolean> {
    const groupUser = await this.groupUserRepository.findOne({
      where: { user: { id: userId }, group: { id: groupId } },
      relations: ['user', 'group'],
    });
    return !!groupUser;
  }
}
