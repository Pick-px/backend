import { Controller, Get, Param, NotFoundException, Query, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { GroupService } from './group.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ApiOkResponse, ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { UserService } from '../user/user.service';

@ApiTags('Group')
@Controller('api/group')
export class GroupController {
  constructor(
    private readonly groupService: GroupService,
    private readonly userService: UserService,
  ) {}

  // 캔버스 ID로 해당 캔버스의 모든 그룹 ID 배열을 반환
  @Get('by-canvas')
  @ApiOkResponse({
    description: '캔버스 ID로 그룹 ID 조회 성공',
    schema: { example: { group_ids: [1, 2, 3] } }
  })
  @ApiTags('Group')
  async getGroupIdByCanvas(
    @Query('canvas_id') canvasId: string, // 파라미터명도 통일
  ) {
    const groups = await this.groupService.findGroupsByCanvasId(Number(canvasId));
    if (!groups || groups.length === 0) throw new NotFoundException('해당 캔버스에 대한 그룹을 찾을 수 없습니다.');
    return { group_ids: groups.map(g => g.id) };
  }

  // 채팅 초기 데이터(유저 참여 그룹, 전체 채팅방 메시지 등)를 반환
  @Get('init/chat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '채팅 초기 데이터 조회', description: 'canvas_id로 유저가 참여중인 그룹 리스트와 전체 채팅방의 최신 메시지(50개)를 반환합니다.' })
  @ApiQuery({ name: 'canvas_id', required: true, description: '캔버스 ID' })
  @ApiResponse({
    status: 200,
    description: '성공',
    schema: {
      example: {
        success: true,
        status: '200',
        message: '요청에 성공하였습니다.',
        data: {
          defaultGroupId: '1',
          groups: [
            { group_id: '1', group_title: 'team gmg' }
          ],
          messages: [
            {
              messageId: 130,
              user: { userId: '1', name: 'Alice' },
              content: '가장 최신 메시지',
              timestamp: '2025-06-30T16:00:00Z'
            }
          ]
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: '인증 실패', schema: { example: { success: false, error: 'Authentication required' } } })
  @ApiResponse({ status: 404, description: 'Default group not found', schema: { example: { success: false, error: 'Default group not found' } } })
  async chatInit(@Req() req, @Query('canvas_id') canvasId: string) {
    try {
      if (!canvasId) {
        throw new HttpException({ success: false, error: 'canvas_id required' }, HttpStatus.BAD_REQUEST);
      }
      const canvasIdNum = Number(canvasId);
      if (isNaN(canvasIdNum)) {
        throw new HttpException({ success: false, error: 'Invalid canvas_id' }, HttpStatus.BAD_REQUEST);
      }
      const userEmail = req.user?.email;
      if (!userEmail) {
        throw new HttpException({ success: false, error: 'Authentication required' }, HttpStatus.UNAUTHORIZED);
      }
      const user = await this.userService.findById(userEmail);
      if (!user) {
        throw new HttpException({ success: false, error: 'Authentication required' }, HttpStatus.UNAUTHORIZED);
      }
      console.log(user);
      // 유저가 참여중인 그룹 리스트
      const groups = await this.groupService.findGroupsByUserId(user.id);
      // 해당 캔버스의 전체 채팅방만 조회
      const defaultGroup = await this.groupService.findDefaultGroupByCanvasId(Number(canvasId));
      if (!defaultGroup) {
        throw new HttpException({ success: false, error: 'Default group not found' }, HttpStatus.NOT_FOUND);
      }
      const defaultGroupId = defaultGroup.id;
      // 해당 그룹의 최신 메시지 50개
      const messages = await this.groupService.getRecentChatsByGroupId(defaultGroupId, 50);
      return {
        success: true,
        status: '200',
        message: '요청에 성공하였습니다.',
        data: {
          defaultGroupId: String(defaultGroupId),
          groups: groups.map(g => ({ group_id: String(g.id), group_title: g.name })),
          messages: messages.map(m => ({
            messageId: m.id,
            user: { userId: String(m.user.id), name: m.user.userName },
            content: m.message,
            timestamp: m.createdAt,
          })),
        },
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException({ success: false, error: 'Internal server error' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // 특정 그룹의 채팅 메시지 기록을 반환 (권한/인증 체크)
  @Get('chat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '특정 그룹의 채팅 메시지 조회', description: 'group_id와 limit을 쿼리로 받아 해당 그룹의 최신 채팅 메시지 기록을 반환합니다.' })
  @ApiQuery({ name: 'group_id', required: true, description: '조회할 그룹 ID' })
  @ApiQuery({ name: 'limit', required: false, description: '불러올 메시지 개수(기본 50)' })
  @ApiResponse({
    status: 200,
    description: '성공',
    schema: {
      example: {
        success: true,
        data: {
          messages: [
            {
              messageId: 130,
              user: { userId: '1', name: 'Alice' },
              content: '가장 최신 메시지',
              timestamp: '2025-06-30T16:00:00Z'
            }
          ]
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: '인증 실패', schema: { example: { success: false, error: 'Authentication required' } } })
  @ApiResponse({ status: 403, description: '권한 없음', schema: { example: { success: false, error: 'You do not have permission to access this chat' } } })
  @ApiResponse({ status: 404, description: '그룹 없음', schema: { example: { success: false, error: 'Group not found' } } })
  async getChatHistory(
    @Req() req,
    @Query('group_id') groupId: string,
    @Query('limit') limit?: string
  ) {
    const userEmail = req.user?.email;
    if (!userEmail) {
      throw new HttpException({ success: false, error: 'Authentication required' }, HttpStatus.UNAUTHORIZED);
    }
    const groupIdNum = Number(groupId);
    if (!groupId || isNaN(groupIdNum)) {
      throw new HttpException({ success: false, error: 'group_id required' }, HttpStatus.BAD_REQUEST);
    }
    const limitNum = limit ? Number(limit) : 50;
    if (isNaN(limitNum) || limitNum <= 0) {
      throw new HttpException({ success: false, error: 'Invalid limit' }, HttpStatus.BAD_REQUEST);
    }
    const user = await this.userService.findById(userEmail);
    if (!user) {
      throw new HttpException({ success: false, error: 'Authentication required' }, HttpStatus.UNAUTHORIZED);
    }
    const group = await this.groupService.findGroupById(groupIdNum);
    if (!group) {
      throw new HttpException({ success: false, error: 'Group not found' }, HttpStatus.NOT_FOUND);
    }
    const isMember = await this.groupService.isUserInGroup(user.id, groupIdNum);
    if (!isMember) {
      throw new HttpException({ success: false, error: 'You do not have permission to access this chat' }, HttpStatus.FORBIDDEN);
    }
    const messages = await this.groupService.getRecentChatsByGroupId(groupIdNum, limitNum);
    return {
      success: true,
      data: {
        messages: messages.map(m => ({
          messageId: m.id,
          user: { userId: String(m.user.id), name: m.user.userName },
          content: m.message,
          timestamp: m.createdAt,
        })),
      }
    };
  }
}
