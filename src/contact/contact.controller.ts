import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { ContactService } from './contact.service';
import { ContactQueryDto, CreateContactDto, ReplyContactDto } from './dto/contact.dto';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  @Post()
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @ApiOperation({ summary: 'Envoyer un message via le formulaire de contact (public)' })
  async create(@Body() dto: CreateContactDto, @Req() req: AuthenticatedRequest) {
    const saved = await this.contactService.create(dto, req);
    return { message: 'Votre message a bien été enregistré.', id: saved.id };
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Lister les messages de contact' })
  async list(@Query() query: ContactQueryDto) {
    return this.contactService.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  async findOne(@Param('id', UuidParamPipe) id: string) {
    const msg = await this.contactService.findById(id);
    await this.contactService.markRead(id);
    return msg;
  }

  @Patch(':id/read')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  async markRead(@Param('id', UuidParamPipe) id: string) {
    return this.contactService.markRead(id);
  }

  @Post(':id/reply')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Répondre à un message' })
  async reply(@Param('id', UuidParamPipe) id: string, @Body() dto: ReplyContactDto) {
    return this.contactService.reply(id, dto.reply);
  }

  @Patch(':id/archive')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  async archive(@Param('id', UuidParamPipe) id: string) {
    return this.contactService.archive(id);
  }
}
