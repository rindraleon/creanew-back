import { BadRequestException } from '@nestjs/common';
import { UuidParamPipe } from './uuid-param.pipe';

describe('UuidParamPipe', () => {
  const pipe = new UuidParamPipe();

  it('accepte un UUID valide (v4 et toute autre version)', () => {
    expect(pipe.transform('c71e7786-36fb-423b-ac5d-b3d32311c25c', {} as never)).toBe(
      'c71e7786-36fb-423b-ac5d-b3d32311c25c',
    );
    expect(pipe.transform('00000000-0000-0000-0000-000000000000', {} as never)).toBe(
      '00000000-0000-0000-0000-000000000000',
    );
  });

  it('refuse une chaîne quelconque en 400, jamais en 500', () => {
    expect(() => pipe.transform('inconnu', {} as never)).toThrow(BadRequestException);
    try {
      pipe.transform('inconnu', {} as never);
    } catch (error) {
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: 'Identifiant invalide.',
      });
    }
  });

  it('refuse les valeurs non-UUID proches (tronquées, préfixées, injection)', () => {
    const invalides = [
      'c71e7786-36fb-423b-ac5d',
      'c71e778636fb423bac5db3d32311c25c',
      'x71e7786-36fb-423b-ac5d-b3d32311c25c',
      "c71e7786-36fb-423b-ac5d-b3d32311c25c' OR '1'='1",
      '../../etc/passwd',
      '',
      '   ',
    ];
    for (const value of invalides) {
      expect(() => pipe.transform(value, {} as never)).toThrow(BadRequestException);
    }
  });

  it('refuse les types non chaînes', () => {
    for (const value of [undefined, null, 42, {}, ['a']]) {
      expect(() => pipe.transform(value, {} as never)).toThrow(BadRequestException);
    }
  });
});
