import {
  ConflictException,
  Injectable,
  ForbiddenException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, DataSource, Not } from 'typeorm';
import { Group } from './entity/group.entity';
import { Chat } from './entity/chat.entity';
import { User } from '../user/entity/user.entity';
import { GroupUser } from '../entity/GroupUser.entity';
import Redis from 'ioredis';

@Injectable()
export class GroupService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    @Inject('REDIS_CHAT_CLIENT')
    private readonly chatRedis: Redis
  ) {}

  async getGroupIdByCanvasId(canvasId: number): Promise<number | null> {
    const group = await this.groupRepository.findOne({ where: { canvasId } });
    return group ? group.id : null;
  }

  async getRecentChatsByGroupId(
    groupId: number,
    take: number
  ): Promise<Chat[]> {
    // Redis에서 최근 메시지만 조회 (최대 50개로 제한)
    const redisChats = await this.chatRedis.lrange(`chat:${groupId}`, 0, Math.min(take, 50) - 1);
    
    // Redis에 있는 메시지들 파싱
    const redisMessages = redisChats
      .map(chatStr => JSON.parse(chatStr))
      .filter(chat => chat.id && chat.user && chat.message) // 유효한 메시지만
      .map(chat => ({
        id: chat.id,
        groupId,
        userId: chat.user.id,
        message: chat.message,
        createdAt: new Date(chat.created_at),
        updatedAt: new Date(chat.created_at),
        user: {
          id: chat.user.id,
          userName: chat.user.user_name
        }
      })) as Chat[];
    
    // Redis 메시지가 충분하면 반환
    if (redisMessages.length >= take) {
      return redisMessages.slice(0, take);
    }
    
    // Redis 메시지가 부족하면 DB에서 추가 조회
    const dbTake = take - redisMessages.length;
    const dbChats = await this.groupRepository.manager.find(Chat, {
      where: { groupId },
      order: { createdAt: 'DESC' },
      take: dbTake,
      relations: ['user'],
    });
    
    // DB 결과를 Redis에 캐싱
    if (dbChats.length > 0) {
      const chatKey = `chat:${groupId}`;
      
      // DB 메시지를 Redis 형식으로 변환
      const dbChatPayloads = dbChats.map(chat => ({
        id: chat.id,
        user: { id: chat.user.id, user_name: chat.user.userName },
        message: chat.message,
        created_at: chat.createdAt.toISOString(),
      }));
      
      // 기존 Redis 메시지와 합쳐서 저장
      const allChats = [...redisMessages, ...dbChats];
      const allPayloads = allChats.map(chat => ({
        id: chat.id,
        user: { id: chat.user.id, user_name: chat.user.userName },
        message: chat.message,
        created_at: chat.createdAt.toISOString(),
      }));
      
      // Redis에 저장 (최대 50개, 12시간 TTL)
      await this.chatRedis.del(chatKey);
      if (allPayloads.length > 0) {
        await this.chatRedis.lpush(chatKey, ...allPayloads.map(p => JSON.stringify(p)));
        await this.chatRedis.ltrim(chatKey, 0, 49);
        await this.chatRedis.expire(chatKey, 12 * 60 * 60);
      }
    }
    
    // Redis + DB 메시지 합치기 (최신순)
    return [...redisMessages, ...dbChats];
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

        const count = await this.dataSource
          .getRepository(GroupUser)
          .createQueryBuilder('group_user')
          .innerJoin('group_user.group', 'group')
          .where('group_user.user.id = :userId', { userId: _id })
          .andWhere('group_user.canvas_id = :canvasId', { canvasId: canvas_id })
          .andWhere('group.is_default = false')
          .getCount();

        if (count >= 3)
          throw new ForbiddenException(
            '캔버스 당 최대 3개의 그룹에만 가입 가능합니다.'
          );

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
          canvas_id: canvas_id,
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

  async joinGroup(groupId: number, _id: number, canvasId: number) {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: _id } });
      const group = await manager.findOne(Group, { where: { id: groupId } });
      const count = await this.dataSource
        .getRepository(GroupUser)
        .createQueryBuilder('group_user')
        .innerJoin('group_user.group', 'group')
        .where('group_user.user.id = :userId', { userId: _id })
        .andWhere('group_user.canvas_id = :canvasId', { canvasId: canvasId })
        .andWhere('group.is_default = false')
        .getCount();
      if (count >= 3)
        throw new ForbiddenException(
          '캔버스 당 최대 3개의 그룹에만 가입 가능합니다.'
        );

      if (!user || !group) {
        throw new NotFoundException('유저 또는 그룹이 존재하지 않습니다.');
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
        canvas_id: group.canvasId,
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
      throw new NotFoundException('그룹이 존재하지 않습니다.');
    }

    const user = await this.userRepository.findOne({
      where: { id: _id },
    });
    if (!user) throw new NotFoundException('유저가 존재하지 않습니다.');
    
    // 그룹 삭제
    if (Number(group.madeBy) === Number(user.id)) {
      await this.groupRepository.remove(group);
      
      // 그룹 삭제 시 Redis 채팅도 즉시 삭제
      try {
        await this.chatRedis.del(`chat:${group_id}`);
        console.log(`[그룹 삭제] 그룹 ${group_id}의 Redis 채팅 삭제`);
      } catch (error) {
        console.error('[그룹 삭제] Redis 채팅 삭제 실패:', error);
      }
    } else {
      // 그룹 탈퇴
      const groupUser = await this.dataSource.manager.findOne(GroupUser, {
        where: { user: { id: user.id }, group: { id: group.id } },
      });
      if (!groupUser) {
        throw new ConflictException('그룹에 가입되어 있지 않습니다.');
      }
      group.currentParticipantsCount -= 1;
      await this.dataSource.manager.remove(groupUser);
    }
  }

  async getGroupList(canvas_id: string, _id: number) {
    const groups = await this.groupRepository
      .createQueryBuilder('group')
      .leftJoin(
        GroupUser,
        'group_user',
        'group_user.group.id = group.id AND group_user.user.id = :userId',
        { userId: _id }
      )
      .where('group.canvasId = :canvasId', { canvasId: Number(canvas_id) })
      .andWhere('group.is_default = false')
      .select([
        'group.id',
        'group.name',
        'group.createdAt',
        'group.updatedAt',
        'group.maxParticipants',
        'group.currentParticipantsCount',
        'group.canvasId',
        'group.madeBy',
      ])
      .addSelect(
        'CASE WHEN group_user.user.id IS NOT NULL THEN true ELSE false END',
        'isJoined'
      )
      .getRawAndEntities();
    console.log(groups);

    const rawResults = groups.raw;
    const allGroup = groups.entities;
    console.log(rawResults);
    const userGroup = rawResults
      .map((row, idx) => {
        const isJoined = row.isJoined ?? false;
        return isJoined ? allGroup[idx] : null;
      })
      .filter((g) => g !== null);

    return {
      allGroup,
      userGroup,
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

  // 특정 캔버스에서 유저가 참여 중인 그룹만 반환
  async findUserGroupsByCanvasId(
    userId: number,
    canvasId: number
  ): Promise<Group[]> {
    const userGroups = await this.dataSource
      .getRepository(GroupUser)
      .createQueryBuilder('group_user')
      .leftJoinAndSelect('group_user.group', 'group')
      .where('group_user.user.id = :userId', { userId })
      .andWhere('group_user.canvas_id = :canvasId', { canvasId })
      .getMany();

    return userGroups.map((groupUser) => groupUser.group);
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

  // Redis 채팅 정리
  async cleanupInactiveGroupChats(): Promise<void> {
    try {
      // 모든 채팅 키 조회
      const chatKeys = await this.chatRedis.keys('chat:*');
      
      if (chatKeys.length === 0) {
        return; // 정리할 게 없으면 조기 종료
      }
      
      console.log(`[정리] 총 ${chatKeys.length}개의 채팅 키 발견`);
      
      let cleanedCount = 0;
      
      for (const chatKey of chatKeys) {
        const groupId = chatKey.replace('chat:', '');
        
        // 그룹이 실제로 존재하는지 확인
        const group = await this.findGroupById(Number(groupId));
        
        if (!group) {
          // 그룹이 삭제된 경우 Redis 채팅도 삭제 
          await this.chatRedis.del(chatKey);
          console.log(`[정리] 삭제된 그룹 ${groupId}의 채팅 삭제`);
          cleanedCount++;
        }
      }
      
      console.log(`[정리] 완료: ${cleanedCount}개의 비활성 채팅 삭제`);
    } catch (error) {
      console.error('[정리] 비활성 그룹 채팅 정리 실패:', error);
    }
  }

  // 주기적 정리 시작 (6시간마다 - 부하 감소)
  startCleanupScheduler(): void {
    setInterval(() => {
      this.cleanupInactiveGroupChats().catch(console.error);
    }, 6 * 60 * 60 * 1000); // 6시간마다
  }
}
