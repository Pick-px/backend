import {
  Controller,
  Get,
  Param,
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
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { Request } from 'supertest';
import { CreateGroupDto } from './dto/create-group.dto';
import { BaseResponseDto } from 'src/dto/base.dto';

interface AuthRequest extends Request {
  user: {
    _id: number;
  };
}

@ApiTags('Group')
@Controller('api/group')
@UseGuards(JwtAuthGuard)
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Get('by-canvas')
  @ApiOkResponse({ schema: { example: { group_id: 1 } } })
  async getGroupIdByCanvas(@Query('canvasId') id: string) {
    const groupId = await this.groupService.getGroupIdByCanvasId(Number(id));
    if (!groupId)
      throw new NotFoundException('Group not found for this canvas');
    return { group_id: groupId };
  }

  @Get(':groupId/chats')
  @ApiOkResponse({ type: [ChatMessageDto] })
  async getRecentChats(
    @Param('groupId') groupId: string
  ): Promise<ChatMessageDto[]> {
    const chats = await this.groupService.getRecentChatsByGroupId(
      Number(groupId)
    );
    return chats.map((chat) => ({
      id: chat.id,
      user: {
        id: chat.user.id,
        user_name: chat.user.userName,
      },
      message: chat.message,
      created_at: chat.createdAt,
    }));
  }

  @Post('create')
  @HttpCode(200) // Set the HTTP status code to 200
  @ApiOperation({ summary: '그룹 생성 api' })
  @ApiOkResponse({
    description: '그룹 생성 성공 시 ',
  })
  @ApiBadRequestResponse({})
  async createGroup(@Req() req: AuthRequest, @Body() data: CreateGroupDto) {
    const _id = req.user._id;
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
  async joinGroup(@Req() req: AuthRequest, @Body() data: { group_id: string }) {
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
  async quitGroup(@Req() req: AuthRequest, @Body() data: { group_id: string }) {
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
