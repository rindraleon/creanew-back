import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import { Notification } from './entities/notification.entity';
import type { Paginated } from '../common/interfaces/paginated.interface';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ApplyTransform } from '../common/decorators/transform.decorator';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

class NotificationQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @ApplyTransform(({ value }: { value: unknown }) => value === true || value === 'true')
  unreadOnly?: boolean;
}

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mes notifications' })
  async findAll(
    @CurrentUser() user: JwtUser,
    @Query() query: NotificationQueryDto,
  ): Promise<Paginated<Notification>> {
    return this.notificationsService.findForUser(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Nombre de notifications non lues' })
  async unreadCount(@CurrentUser() user: JwtUser): Promise<{ count: number }> {
    return { count: await this.notificationsService.countUnread(user.id) };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  async markAsRead(
    @CurrentUser() user: JwtUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<Notification> {
    try {
      return await this.notificationsService.markAsRead(user.id, id);
    } catch {
      throw BusinessException.notFound('Notification introuvable.', ErrorCode.NOT_FOUND);
    }
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tout marquer comme lu' })
  async markAllAsRead(@CurrentUser() user: JwtUser): Promise<{ updated: number }> {
    return { updated: await this.notificationsService.markAllAsRead(user.id) };
  }
}
