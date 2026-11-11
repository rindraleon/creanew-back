import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto, UpdateCollectionDto } from './dto/collection.dto';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('collections')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lister les collections publiées (public)' })
  async findAll() {
    return this.collectionsService.findAll(false);
  }

  @Get('admin/all')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Toutes les collections, publiées ou non' })
  async findAllForAdmin() {
    return this.collectionsService.findAll(true);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Détail collection par slug (public)' })
  async findBySlug(@Param('slug') slug: string) {
    return this.collectionsService.findBySlug(slug);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Créer une collection' })
  async create(@Body() dto: CreateCollectionDto, @Req() req: AuthenticatedRequest) {
    return this.collectionsService.create(dto, req);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Modifier une collection' })
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateCollectionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.update(id, dto, req);
  }

  @Patch(':id/publish')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Publier / dépublier' })
  async publish(
    @Param('id', UuidParamPipe) id: string,
    @Body() body: { isPublished: boolean },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.setPublish(id, body.isPublished, req);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Supprimer (soft delete)' })
  async remove(@Param('id', UuidParamPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.collectionsService.remove(id, req);
  }
}
