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
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CategoriesService, type CategoryWithCount } from './categories.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import {
  CategoryQueryDto,
  CategoryResponseDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Catégories actives du catalogue public' })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async findAll(@Query() query: CategoryQueryDto): Promise<CategoryWithCount[]> {
    return this.categoriesService.findAll({ search: query.search, isActive: true });
  }

  @Get('admin/all')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Toutes les catégories, actives et inactives' })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async findAllForAdmin(@Query() query: CategoryQueryDto): Promise<CategoryWithCount[]> {
    return this.categoriesService.findAll({
      includeInactive: query.includeInactive ?? true,
      search: query.search,
      isActive: query.isActive,
    });
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Détail d’une catégorie active par slug' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiResponse({ status: 404, description: 'Catégorie introuvable.' })
  async findBySlug(@Param('slug') slug: string): Promise<CategoryWithCount> {
    return this.categoriesService.findBySlug(slug);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Créer une catégorie' })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  async create(
    @Body() dto: CreateCategoryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CategoryWithCount> {
    return this.categoriesService.create(dto, request);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Modifier une catégorie' })
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CategoryWithCount> {
    return this.categoriesService.update(id, dto, request);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Supprimer une catégorie (soft delete)' })
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.categoriesService.remove(id, request);
  }
}
