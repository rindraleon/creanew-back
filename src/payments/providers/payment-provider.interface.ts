import { MobileMoneyProvider } from '../../common/enums';

export interface ReferenceCheckResult {
  automatic: boolean;
  verified?: boolean;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: MobileMoneyProvider;
  readonly label: string;
  /** Préfixes/plages acceptés pour une référence de transaction. */
  validateReferenceFormat(reference: string): boolean;
  /** Interrogerait l'API officielle de l'opérateur si elle était branchée. */
  checkReference(reference: string): Promise<ReferenceCheckResult>;
  /** Consignes affichées au client pour effectuer le paiement. */
  instructions(amount: number, orderNumber: string): string;
}

export abstract class BasePaymentProvider implements PaymentProvider {
  abstract readonly name: MobileMoneyProvider;
  abstract readonly label: string;

  validateReferenceFormat(reference: string): boolean {
    const cleaned = reference.trim().toUpperCase();
    return /^[A-Z0-9]{6,40}$/.test(cleaned);
  }

  async checkReference(reference: string): Promise<ReferenceCheckResult> {
    return {
      automatic: false,
      verified: false,
      reference,
      metadata: { reason: 'Aucune API opérateur configurée : vérification manuelle requise.' },
    };
  }

  instructions(amount: number, orderNumber: string): string {
    return `Envoyez ${amount} MGA puis saisissez la référence de transaction reçue pour la commande ${orderNumber}.`;
  }
}
