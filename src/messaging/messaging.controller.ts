import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MessagingService } from './messaging.service';
import {
  ConversationQueryDto,
  CreateConversationDto,
  MessageQueryDto,
  SendMessageDto,
} from './dto/messaging.dto';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('messaging')
@ApiBearerAuth('access-token')
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une conversation (client → vendeur/admin)' })
  async create(@CurrentUser() user: JwtUser, @Body() dto: CreateConversationDto) {
    return this.messagingService.createConversation(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister mes conversations' })
  async list(@CurrentUser() user: JwtUser, @Query() query: ConversationQueryDto) {
    return this.messagingService.listForUser(user.id, user.role, {
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  @Get(':id')
  async getOne(@Param('id', UuidParamPipe) id: string, @CurrentUser() user: JwtUser) {
    return this.messagingService.getConversation(id, user.id, user.role);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Historique des messages' })
  async messages(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Query() query: MessageQueryDto,
  ) {
    return this.messagingService.getMessages(id, user.id, user.role, {
      limit: query.limit ?? 200,
      offset: query.offset ?? 0,
    });
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Envoyer un message' })
  async send(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(id, user.id, dto, user.role);
  }

  @Patch(':id/read')
  async markRead(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Body() body?: { messageId?: string },
  ) {
    await this.messagingService.markRead(id, user.id, body?.messageId, user.role);
    return { message: 'Marqué lu' };
  }

  @Patch(':id/close')
  async close(@Param('id', UuidParamPipe) id: string, @CurrentUser() user: JwtUser) {
    return this.messagingService.closeConversation(id, user.id, user.role);
  }
}
