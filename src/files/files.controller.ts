import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { StorageService, type UploadedFileLike } from '../shared/storage/storage.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import { StorageBucket, UserRole } from '../common/enums';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { DeleteFileDto, UploadedFileResponseDto, UPLOAD_RULES } from './dto/file.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../common/enums';

@ApiTags('files')
@ApiBearerAuth('access-token')
@Controller('files')
export class FilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Get('rules')
  @ApiOperation({ summary: 'Règles d’upload (types MIME et tailles autorisés)' })
  rules() {
    return UPLOAD_RULES;
  }

  @Post('upload')
  // Limite multer AVANT tout buffering : sans elle, un fichier de plusieurs
  // centaines de mégaoctets serait chargé en mémoire avant d'être refusé.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Uploader un fichier (MinIO)',
    description:
      "L'objectKey est généré côté serveur (bucket/année/mois/uuid.ext) : le client ne choisit jamais le chemin de destination.",
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, type: UploadedFileResponseDto })
  @ApiResponse({ status: 415, description: 'Type de fichier non autorisé.' })
  async upload(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Query('bucket', new ParseEnumPipe(StorageBucket)) bucket: StorageBucket,
    @Req() request: AuthenticatedRequest,
  ): Promise<UploadedFileResponseDto> {
    if (!file) {
      throw BusinessException.badRequest('Aucun fichier reçu.', ErrorCode.VALIDATION_ERROR);
    }

    // Réservation : les images produits sont réservées aux vendeurs approuvés.
    if (
      bucket === StorageBucket.PRODUCTS &&
      user?.role !== UserRole.SELLER &&
      user?.role !== UserRole.ADMIN
    ) {
      throw BusinessException.forbidden(
        'Seuls les vendeurs peuvent ajouter des images produits.',
        ErrorCode.FORBIDDEN,
      );
    }

    const stored = await this.storage.upload(bucket, file, {
      'uploaded-by': user.id,
    });

    await this.audit.log({
      userId: user.id,
      action: AuditAction.FILE_UPLOADED,
      entity: AuditEntity.FILE,
      entityId: stored.objectKey,
      request,
      metadata: { bucket, size: stored.size, mimeType: stored.mimeType },
    });

    return stored;
  }

  @Delete()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Admin] Supprimer un fichier' })
  async remove(
    @Body() dto: DeleteFileDto,
    @CurrentUser() admin: JwtUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.storage.delete(dto.bucket, dto.objectKey);
    await this.audit.log({
      userId: admin.id,
      action: AuditAction.FILE_DELETED,
      entity: AuditEntity.FILE,
      entityId: dto.objectKey,
      request,
      metadata: { bucket: dto.bucket },
    });
  }

  @Get('presigned-url')
  @ApiOperation({ summary: 'Obtenir une URL signée temporaire' })
  async presignedUrl(
    @Query('bucket', new ParseEnumPipe(StorageBucket)) bucket: StorageBucket,
    @Query('objectKey') objectKey: string,
  ): Promise<{ url: string }> {
    return { url: await this.storage.getPresignedUrl(bucket, objectKey, 3600) };
  }
}
