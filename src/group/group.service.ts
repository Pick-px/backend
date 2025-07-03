import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, DataSource } from 'typeorm';
import { Group } from './entity/group.entity';
import { Chat } from './entity/chat.entity';
import { User } from '../user/entity/user.entity';
import { GroupUser } from '../entity/GroupUser.entity';

@Injectable()
export class GroupService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource
  ) {}

  async getGroupIdByCanvasId(canvasId: number): Promise<number | null> {
    const group = await this.groupRepository.findOne({ where: { canvasId } });
    return group ? group.id : null;
  }

  async getRecentChatsByGroupId(
    groupId: number,
    take: number
  ): Promise<Chat[]> {
    return this.groupRepository.manager.find(Chat, {
      where: { groupId },
      order: { createdAt: 'DESC' },
      take,
      relations: ['user'],
    });
  }

  async createGroup(
    groupName: string,
    maxParticipants: string,
    canvasId: string,
    _id: number
  ) {
    const max = Number(maxParticipants);
    const canvas_id = Number(canvasId);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const made_by_user = await manager.findOne(User, {
          where: { id: _id },
        });

        if (!made_by_user) {
          throw new ConflictException('유저가 존재하지 않습니다.');
        }

        const group = manager.create(Group, {
          name: groupName,
          maxParticipants: max,
          createdAt: new Date(),
          updatedAt: new Date(),
          madeBy: made_by_user.id,
          canvasId: canvas_id,
        });

        const savedGroup = await manager.save(group);

        const groupUser = manager.create(GroupUser, {
          group: savedGroup,
          user: made_by_user,
          join: new Date(),
        });

        await manager.save(groupUser);

        return savedGroup;
      });
    } catch (err) {
      if (err instanceof QueryFailedError) {
        if ('code' in err && err.code === '23505') {
          throw new ConflictException('중복된 데이터입니다.');
        }
      } else if (err instanceof ConflictException) {
        throw new ConflictException('유저가 존재하지 않습니다.');
      }
      throw err;
    }
  }

  async joinGroup(groupId: number, _id: number) {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: _id } });
      const group = await manager.findOne(Group, { where: { id: groupId } });

      if (!user || !group) {
        throw new ConflictException('유저 또는 그룹이 존재하지 않습니다.');
      }

      const existingGroupUser = await manager.findOne(GroupUser, {
        where: { user: { id: user.id }, group: { id: group.id } },
      });

      if (existingGroupUser) {
        throw new ConflictException('이미 그룹에 가입되어 있습니다.');
      }
      if (group.maxParticipants <= group.currentParticipantsCount) {
        throw new ConflictException('그룹이 가득 찼습니다.');
      }

      const groupUser = manager.create(GroupUser, {
        group: group,
        user: user,
        join: new Date(),
      });

      group.currentParticipantsCount += 1;
      await manager.save(group);
      await manager.save(groupUser);
    });
  }

  async quitOrDeleteGroup(group_id: string, _id: number) {
    const group = await this.groupRepository.findOne({
      where: { id: Number(group_id) },
    });
    if (!group) {
      throw new ConflictException('그룹이 존재하지 않습니다.');
    }

    const user = await this.userRepository.findOne({
      where: { id: _id },
    });
    if (!user) throw new ConflictException('유저가 존재하지 않습니다.');

    console.log(group.madeBy, user.id);
    console.log(
      'group.id type: ',
      typeof group.madeBy,
      'user.id type: ',
      typeof user.id
    );
    // 그룹 삭제
    if (Number(group.madeBy) === Number(user.id)) {
      await this.groupRepository.remove(group);
    } else {
      // 그룹 탈퇴
      const groupUser = await this.dataSource.manager.findOne(GroupUser, {
        where: { user: { id: user.id }, group: { id: group.id } },
      });
      if (!groupUser) {
        throw new ConflictException('그룹에 가입되어 있지 않습니다.');
      }
      group.currentParticipantsCount -= 1;
      await this.dataSource.manager.save(group);
      await this.dataSource.manager.remove(groupUser);
    }
  }

  async getGroupList(canvas_id: string, _id: number) {
    const allGroupOnCanvas = await this.groupRepository.find({
      where: { canvasId: Number(canvas_id) },
    });

    const userGroups = await this.dataSource
      .getRepository(GroupUser)
      .createQueryBuilder('group_user')
      .leftJoinAndSelect('group_user.group', 'group')
      .where('group_user.user.id = :userId', { userId: _id })
      .andWhere('group.canvasId = :canvasId', { canvasId: canvas_id })
      .getMany();

    const userGroupList = userGroups.map((groupUser) => groupUser.group);

    return {
      allGroup: allGroupOnCanvas,
      userGroup: userGroupList,
    };
  }

  async getGroupByName(name: string, canvas_id: string, _id: number) {
    return await this.groupRepository
      .createQueryBuilder('group')
      .where('group.canvasId = :canvasId', { canvasId: Number(canvas_id) })
      .andWhere('group.name ILIKE :name', { name: `%${name}%` })
      .andWhere('group.currentParticipantsCount < group.maxParticipants')
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(GroupUser, 'group_user')
          .where('group_user.group.id = group.id')
          .andWhere('group_user.user.id = :userId')
          .getQuery();
        return `NOT EXISTS ${subQuery}`;
      })
      .setParameter('userId', _id)
      .getMany();
  }

  // 특정 유저가 참여 중인 모든 그룹을 반환
  async findGroupsByUserId(userId: number): Promise<Group[]> {
    const groupUsers = await this.dataSource.getRepository(GroupUser).find({
      where: { user: { id: userId } },
      relations: ['group'],
    });
    return groupUsers.map((gu) => gu.group);
  }

  // 캔버스 ID로 해당 캔버스의 모든 그룹을 반환
  async findGroupsByCanvasId(canvasId: number): Promise<Group[]> {
    return this.groupRepository.find({ where: { canvasId } });
  }

  // 캔버스 ID로 전체 채팅방(기본 그룹, is_default=true) 반환
  async findDefaultGroupByCanvasId(canvasId: number): Promise<Group | null> {
    return this.groupRepository.findOne({
      where: { canvasId, is_default: true },
    });
  }

  // 그룹 ID로 그룹 엔티티 반환
  async findGroupById(groupId: number): Promise<Group | null> {
    return this.groupRepository.findOne({ where: { id: groupId } });
  }

  // 유저가 해당 그룹에 속해있는지 여부 반환
  async isUserInGroup(userId: number, groupId: number): Promise<boolean> {
    const groupUser = await this.dataSource.getRepository(GroupUser).findOne({
      where: { user: { id: userId }, group: { id: groupId } },
      relations: ['user', 'group'],
    });
    return !!groupUser;
  }
}
