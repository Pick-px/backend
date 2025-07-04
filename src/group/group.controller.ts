import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Post,
  Body,
  Req,
  HttpCode,
  HttpException,
  HttpStatus,
  Delete,
} from '@nestjs/common';
import { GroupService } from './group.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import {
  ApiOkResponse,
  ApiTags,
  ApiOperation,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupIdDto } from './dto/group-id.dto';
import { QuitGroupDto } from './dto/quit-group.dto';
import { ChatInitResponseDto } from './dto/chat-init-response.dto';
import { ChatHistoryResponseDto } from './dto/chat-history-response.dto';
import { BaseResponseDto } from 'src/dto/base.dto';
import { UserService } from '../user/user.service';
import { AuthRequest } from '../interface/AuthRequest.interface';

@ApiTags('Group')
@Controller('api/group')
export class GroupController {
  constructor(
    private readonly groupService: GroupService,
    private readonly userService: UserService
  ) {}

  // 캔버스 ID로 해당 캔버스의 모든 그룹 ID 배열을 반환
  @Get('by-canvas')
  @ApiOperation({
    summary: '캔버스 ID로 그룹 ID 조회',
    description:
      '캔버스 ID를 받아 해당 캔버스의 모든 그룹 ID 배열을 반환합니다.',
  })
  @ApiQuery({ name: 'canvas_id', required: true, description: '캔버스 ID' })
  @ApiOkResponse({
    description: '캔버스 ID로 그룹 ID 조회 성공',
    schema: { example: { group_ids: [1, 2, 3] } },
  })
  @ApiTags('Group')
  async getGroupIdByCanvas(
    @Query('canvas_id') canvasId: string // 파라미터명도 통일
  ) {
    const groups = await this.groupService.findGroupsByCanvasId(
      Number(canvasId)
    );
    if (!groups || groups.length === 0)
      throw new NotFoundException(
        '해당 캔버스에 대한 그룹을 찾을 수 없습니다.'
      );
    return { group_ids: groups.map((g) => g.id) };
  }

  // 채팅 초기 데이터(유저 참여 그룹, 전체 채팅방 메시지 등)를 반환
  @Get('init/chat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '채팅 초기 데이터 조회',
    description:
      'canvas_id로 유저가 참여중인 그룹 리스트와 전체 채팅방의 최신 메시지(50개)를 반환합니다.',
  })
  @ApiQuery({ name: 'canvas_id', required: true, description: '캔버스 ID' })
  @ApiResponse({
    status: 200,
    description: '성공',
    type: ChatInitResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: '인증 실패',
    schema: { example: { success: false, error: 'Authentication required' } },
  })
  @ApiResponse({
    status: 404,
    description: 'Default group not found',
    schema: { example: { success: false, error: 'Default group not found' } },
  })
  async chatInit(@Req() req, @Query('canvas_id') canvasId: string) {
    try {
      if (!canvasId) {
        throw new HttpException(
          { success: false, error: 'canvas_id required' },
          HttpStatus.BAD_REQUEST
        );
      }
      const canvasIdNum = Number(canvasId);
      if (isNaN(canvasIdNum)) {
        throw new HttpException(
          { success: false, error: 'Invalid canvas_id' },
          HttpStatus.BAD_REQUEST
        );
      }
      console.log(req.user);
      const user_id = req.user?._id;
      if (!user_id) {
        throw new HttpException(
          { success: false, error: 'Authentication required' },
          HttpStatus.UNAUTHORIZED
        );
      }
      const user = await this.userService.findById(user_id);
      if (!user) {
        throw new HttpException(
          { success: false, error: 'Authentication required' },
          HttpStatus.UNAUTHORIZED
        );
      }
      console.log(user);
      // 해당 캔버스에서 유저가 참여중인 그룹 리스트만 조회
      const groups = await this.groupService.findUserGroupsByCanvasId(user.id, Number(canvasId));
      // 해당 캔버스의 전체 채팅방만 조회
      const defaultGroup = await this.groupService.findDefaultGroupByCanvasId(
        Number(canvasId)
      );
      if (!defaultGroup) {
        throw new HttpException(
          { success: false, error: 'Default group not found' },
          HttpStatus.NOT_FOUND
        );
      }
      const defaultGroupId = defaultGroup.id;
      // 전체 채팅 자동 참여
      const isMember = await this.groupService.isUserInGroup(
        user.id,
        defaultGroupId
      );
      if (!isMember) {
        await this.groupService.joinGroup(defaultGroupId, user.id);
      }
      // 해당 그룹의 최신 메시지 50개
      const messages = await this.groupService.getRecentChatsByGroupId(
        defaultGroupId,
        50
      );
      return {
        success: true,
        status: '200',
        message: '요청에 성공하였습니다.',
        data: {
          defaultGroupId: String(defaultGroupId),
          groups: groups.map((g) => ({
            group_id: String(g.id),
            group_title: g.name,
          })),
          messages: messages.map((m) => ({
            messageId: m.id,
            user: { userId: String(m.user.id), name: m.user.userName },
            content: m.message,
            timestamp: m.createdAt,
          })),
        },
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { success: false, error: 'Internal server error' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // 특정 그룹의 채팅 메시지 기록을 반환 (권한/인증 체크)
  @Get('chat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '특정 그룹의 채팅 메시지 조회',
    description:
      'group_id와 limit을 쿼리로 받아 해당 그룹의 최신 채팅 메시지 기록을 반환합니다.',
  })
  @ApiQuery({ name: 'group_id', required: true, description: '조회할 그룹 ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '불러올 메시지 개수(기본 50)',
  })
  @ApiResponse({
    status: 200,
    description: '성공',
    type: ChatHistoryResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: '인증 실패',
    schema: { example: { success: false, error: 'Authentication required' } },
  })
  @ApiResponse({
    status: 403,
    description: '권한 없음',
    schema: {
      example: {
        success: false,
        error: 'You do not have permission to access this chat',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: '그룹 없음',
    schema: { example: { success: false, error: 'Group not found' } },
  })
  async getChatHistory(
    @Req() req,
    @Query('group_id') groupId: string,
    @Query('limit') limit?: string
  ) {
    const user_id = req.user?._id;
    if (!user_id) {
      throw new HttpException(
        { success: false, error: 'Authentication required' },
        HttpStatus.UNAUTHORIZED
      );
    }
    const groupIdNum = Number(groupId);
    if (!groupId || isNaN(groupIdNum)) {
      throw new HttpException(
        { success: false, error: 'group_id required' },
        HttpStatus.BAD_REQUEST
      );
    }
    const limitNum = limit ? Number(limit) : 50;
    if (isNaN(limitNum) || limitNum <= 0) {
      throw new HttpException(
        { success: false, error: 'Invalid limit' },
        HttpStatus.BAD_REQUEST
      );
    }
    const user = await this.userService.findById(user_id);
    if (!user) {
      throw new HttpException(
        { success: false, error: 'Authentication required' },
        HttpStatus.UNAUTHORIZED
      );
    }
    const group = await this.groupService.findGroupById(groupIdNum);
    if (!group) {
      throw new HttpException(
        { success: false, error: 'Group not found' },
        HttpStatus.NOT_FOUND
      );
    }
    const isMember = await this.groupService.isUserInGroup(user.id, groupIdNum);
    if (!isMember) {
      throw new HttpException(
        {
          success: false,
          error: 'You do not have permission to access this chat',
        },
        HttpStatus.FORBIDDEN
      );
    }
    const messages = await this.groupService.getRecentChatsByGroupId(
      groupIdNum,
      limitNum
    );
    return {
      success: true,
      data: {
        messages: messages.map((m) => ({
          messageId: m.id,
          user: { userId: String(m.user.id), name: m.user.userName },
          content: m.message,
          timestamp: m.createdAt,
        })),
      },
    };
  }

  @Post('create')
  @HttpCode(200) // Set the HTTP status code to 200
  @ApiOperation({ summary: '그룹 생성 api' })
  @ApiOkResponse({
    description: '그룹 생성 성공 시 ',
    type: BaseResponseDto,
  })
  @ApiBadRequestResponse({})
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createGroup(@Req() req: AuthRequest, @Body() data: CreateGroupDto) {
    const _id = req.user._id;
    console.log(_id);
    const { name, maxParticipants, canvasId } = data;
    try {
      await this.groupService.createGroup(name, maxParticipants, canvasId, _id);
      const response = new BaseResponseDto();
      response.isSuccess = true;
      response.message = '그룹 생성에 성공하였습니다.';
      return response;
    } catch (err) {
      throw new HttpException(
        {
          isSuccess: false,
          message: '그룹 생성에 실패하였습니다.',
        },
        HttpStatus.NOT_FOUND
      );
    }
  }

  @Get('list')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '그룹 목록 조회 api' })
  @ApiOkResponse({
    description: '그룹 목록 조회 성공 시 ',
    type: BaseResponseDto,
  })
  async getGroupList(
    @Req() req: AuthRequest,
    @Query('canvas_id') canvas_id: string
  ) {
    const _id = req.user._id;
    try {
      const response = new BaseResponseDto();
      response.isSuccess = true;
      response.message = '그룹 참여에 성공하였습니다.';
      response.data = await this.groupService.getGroupList(canvas_id, _id);
      return response;
    } catch (err) {
      throw new HttpException(
        {
          isSuccess: false,
          message: '그룹 목록을 불러오는데 실패하였습니다.',
        },
        HttpStatus.NOT_FOUND
      );
    }
  }

  @Post('join')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '그룹 입장 api' })
  @ApiOkResponse({
    description: '그룹 입장 성공 시 ',
    type: BaseResponseDto,
  })
  @ApiBadRequestResponse({})
  @ApiBearerAuth()
  async joinGroup(@Req() req: AuthRequest, @Body() data: GroupIdDto) {
    const _id = req.user._id;
    const { group_id } = data;
    try {
      await this.groupService.joinGroup(Number(group_id), _id);
      const response = new BaseResponseDto();
      response.isSuccess = true;
      response.message = '그룹 참여에 성공하였습니다.';
      return response;
    } catch (err) {
      throw new HttpException(
        {
          isSuccess: false,
          message: '그룹 참여에 실패하였습니다.',
        },
        HttpStatus.NOT_FOUND
      );
    }
  }

  @Delete('quit')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '그룹 탈퇴 api' })
  @ApiOkResponse({
    description: '그룹 탈퇴 성공 시 ',
    type: BaseResponseDto,
  })
  @ApiBadRequestResponse({})
  @ApiBearerAuth()
  async quitGroup(@Req() req: AuthRequest, @Body() data: QuitGroupDto) {
    const _id = req.user._id;
    const { group_id } = data;
    try {
      await this.groupService.quitOrDeleteGroup(group_id, _id);
      const response = new BaseResponseDto();
      response.isSuccess = true;
      response.message = '그룹 탈퇴에 성공하였습니다.';
      return response;
    } catch (err) {
      throw new HttpException(
        {
          isSuccess: false,
          message: '그룹 탈퇴에 실패하였습니다.',
        },
        HttpStatus.NOT_FOUND
      );
    }
  }

  @Get('search')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '그룹 검색 api' })
  @ApiOkResponse({
    description: '그룹 검색 성공 시 ',
    type: BaseResponseDto,
  })
  @ApiBadRequestResponse({})
  @ApiBearerAuth()
  async searchGroup(
    @Req() req: AuthRequest,
    @Query('groupName') groupName: string,
    @Query('canvas_id') canvas_id: string
  ) {
    try {
      const _id = req.user._id;
      const response = new BaseResponseDto();
      response.isSuccess = true;
      response.message = '그룹 검색에 성공하였습니다.';
      response.data = await this.groupService.getGroupByName(
        groupName,
        canvas_id,
        _id
      );
      console.log(response.data);
      return response;
    } catch (err) {
      throw new HttpException(
        {
          isSuccess: false,
          message: '그룹 검색에 실패하였습니다.',
        },
        HttpStatus.NOT_FOUND
      );
    }
  }
}
