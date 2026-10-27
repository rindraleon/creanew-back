import { MobileMoneyProvider } from '../../common/enums';
import { BasePaymentProvider, type ReferenceCheckResult } from './payment-provider.interface';

/** MVola — vérification manuelle tant que l'API officielle n'est pas branchée. */
export class MvolaProvider extends BasePaymentProvider {
  readonly name = MobileMoneyProvider.MVOLA;
  readonly label = 'MVola';

  override validateReferenceFormat(reference: string): boolean {
    const cleaned = reference.trim().toUpperCase();
    return /^[A-Z0-9]{8,30}$/.test(cleaned);
  }

  override async checkReference(reference: string): Promise<ReferenceCheckResult> {
    return {
      automatic: false,
      verified: false,
      reference,
      metadata: { provider: this.name, mode: 'manual' },
    };
  }
}

export class OrangeMoneyProvider extends BasePaymentProvider {
  readonly name = MobileMoneyProvider.ORANGE_MONEY;
  readonly label = 'Orange Money';

  override validateReferenceFormat(reference: string): boolean {
    const cleaned = reference.trim().toUpperCase();
    return /^(OM)?[A-Z0-9]{6,30}$/.test(cleaned);
  }

  override async checkReference(reference: string): Promise<ReferenceCheckResult> {
    return {
      automatic: false,
      verified: false,
      reference,
      metadata: { provider: this.name, mode: 'manual' },
    };
  }
}

export class AirtelMoneyProvider extends BasePaymentProvider {
  readonly name = MobileMoneyProvider.AIRTEL_MONEY;
  readonly label = 'Airtel Money';

  override validateReferenceFormat(reference: string): boolean {
    const cleaned = reference.trim().toUpperCase();
    return /^(AM)?[A-Z0-9]{6,30}$/.test(cleaned);
  }

  override async checkReference(reference: string): Promise<ReferenceCheckResult> {
    return {
      automatic: false,
      verified: false,
      reference,
      metadata: { provider: this.name, mode: 'manual' },
    };
  }
}

export function getProvider(name: MobileMoneyProvider): BasePaymentProvider {
  switch (name) {
    case MobileMoneyProvider.MVOLA:
      return new MvolaProvider();
    case MobileMoneyProvider.ORANGE_MONEY:
      return new OrangeMoneyProvider();
    case MobileMoneyProvider.AIRTEL_MONEY:
      return new AirtelMoneyProvider();
    default:
      throw new Error(`Opérateur non supporté : ${String(name)}`);
  }
}
