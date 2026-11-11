import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { SiteContentService } from './site-content.service';
import { UpsertSiteSettingDto } from './dto/site-content.dto';

@ApiTags('site-content')
@Controller('site-content')
export class SiteContentController {
  constructor(private readonly siteContentService: SiteContentService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lister tous les contenus publics (homepage, contact_info, etc.)' })
  async list() {
    return this.siteContentService.getAll();
  }

  @Public()
  @Get(':key')
  async getOne(@Param('key') key: string) {
    return this.siteContentService.getByKey(key);
  }

  @Put(':key')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[Admin] Créer/modifier un contenu (homepage, contact_info…)' })
  async upsert(@Param('key') key: string, @Body() dto: UpsertSiteSettingDto) {
    return this.siteContentService.upsert(key, dto.value, dto.description);
  }
}
