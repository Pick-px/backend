import { Controller, Get, Param, NotFoundException, Query } from '@nestjs/common';
import { GroupService } from './group.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Group')
@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Get('by-canvas')
  @ApiOkResponse({  schema: { example: { group_id: 1 } } })
  async getGroupIdByCanvas(@Query('canvasId') id: string,) {
    const groupId = await this.groupService.getGroupIdByCanvasId(Number(id));
    if (!groupId) throw new NotFoundException('Group not found for this canvas');
    return { group_id: groupId };
  }

  @Get(':groupId/chats')
  @ApiOkResponse({ type: [ChatMessageDto] })
  async getRecentChats(@Param('groupId') groupId: string): Promise<ChatMessageDto[]> {
    const chats = await this.groupService.getRecentChatsByGroupId(Number(groupId));
    return chats.map(chat => ({
      id: chat.id,
      user: {
        id: chat.user.id,
        user_name: chat.user.userName,
      },
      message: chat.message,
      created_at: chat.createdAt,
    }));
  }
}
