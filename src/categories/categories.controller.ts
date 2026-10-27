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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CategoriesService } from './categories.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import {
  CategoryQueryDto,
  CategoryResponseDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { Category } from './entities/category.entity';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lister les catégories (publiques)' })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async findAll(@Query() query: CategoryQueryDto): Promise<Category[]> {
    const isAdmin = (query.includeInactive ?? false) === true;
    return this.categoriesService.findAll(isAdmin);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Détail d’une catégorie par slug' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiResponse({ status: 404, description: 'Catégorie introuvable.' })
  async findBySlug(@Param('slug') slug: string): Promise<Category> {
    return this.categoriesService.findBySlug(slug);
  }

  /* --------------------------- Administration --------------------------- */

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Créer une catégorie' })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  async create(
    @Body() dto: CreateCategoryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Category> {
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
  ): Promise<Category> {
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
