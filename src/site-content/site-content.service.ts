import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSetting } from './entities/site-setting.entity';
import { assertValidEmail } from '../common/validators/email-disposable.validator';
import { BusinessException } from '../common/errors/business.exception';
import { isPublishedLegalPolicy, LEGAL_KEYS } from './legal-policy';

@Injectable()
export class SiteContentService {
  constructor(@InjectRepository(SiteSetting) private readonly repo: Repository<SiteSetting>) {}

  async getAll(): Promise<SiteSetting[]> {
    // Une lecture ne doit jamais insérer des données par défaut.
    return this.repo.find();
  }

  async getByKey(key: string): Promise<SiteSetting | null> {
    return this.repo.findOne({ where: { key } });
  }

  async upsert(
    key: string,
    value: Record<string, unknown>,
    description?: string,
  ): Promise<SiteSetting> {
    if (
      LEGAL_KEYS.some((legalKey) => legalKey === key) &&
      value.published === true &&
      !isPublishedLegalPolicy(value)
    ) {
      throw BusinessException.badRequest(
        'Une version et un texte juridique non vide sont requis avant publication.',
      );
    }
    if (key === 'contact_info' && value.email !== undefined) {
      const field = value.email;
      if (typeof field === 'string') value.email = assertValidEmail(field);
      else if (Array.isArray(field) && typeof field[0] === 'string') {
        const values: unknown[] = field;
        value.email = values.map((item, index) => {
          if (typeof item !== 'string')
            throw BusinessException.badRequest('Adresse e-mail de contact invalide.');
          return index === 0 || item.includes('@') ? assertValidEmail(item) : item;
        });
      } else throw BusinessException.badRequest('Adresse e-mail de contact invalide.');
    }
    let setting = await this.repo.findOne({ where: { key } });
    if (!setting) setting = this.repo.create({ key, value, description: description ?? null });
    else {
      setting.value = value;
      if (description !== undefined) setting.description = description;
    }
    return this.repo.save(setting);
  }
}
