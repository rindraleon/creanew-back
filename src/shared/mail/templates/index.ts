import type { MailMessage } from '../mail.service';

const money = (value: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value) + ' MGA';

const layout = (title: string, body: string, appName = 'MOBILIER-SHOP'): string => `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2622;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <tr><td style="background:#7c5c43;padding:22px 28px;color:#fff;font-size:20px;font-weight:700;">${appName}</td></tr>
          <tr><td style="padding:28px;">
            <h1 style="margin:0 0 16px;font-size:20px;color:#2b2622;">${title}</h1>
            <div style="font-size:15px;line-height:1.6;color:#4a423c;">${body}</div>
          </td></tr>
          <tr><td style="padding:18px 28px;background:#faf9f7;color:#8a7f75;font-size:12px;">
            Cet e-mail est automatique, merci de ne pas y répondre.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

interface OrderCreatedSellerPayload {
  to: string;
  sellerName: string;
  orderNumber: string;
  lines: { name: string; quantity: number; lineTotal: number }[];
  sellerAmount: number;
  frontendUrl: string;
}

export const welcomeTemplate = (to: string, name: string, frontendUrl: string): MailMessage => ({
  to,
  subject: 'Bienvenue sur MOBILIER-SHOP',
  html: layout(
    `Bienvenue ${name} !`,
    `<p>Votre compte a été créé avec succès. Vous pouvez dès maintenant parcourir le catalogue et passer commande.</p>
     <p><a href="${frontendUrl}/boutique" style="color:#7c5c43;">Découvrir le catalogue</a></p>`,
  ),
});

export const sellerPendingTemplate = (to: string, name: string): MailMessage => ({
  to,
  subject: 'Votre demande vendeur a bien été reçue',
  html: layout(
    'Demande en cours de validation',
    `<p>Bonjour ${name},</p>
     <p>Votre demande pour devenir vendeur a bien été enregistrée. Un administrateur va l'examiner.</p>
     <p>Vous serez notifié dès que votre boutique sera validée. Aucune publication n'est possible avant cette validation.</p>`,
  ),
});

export const sellerApprovedTemplate = (
  to: string,
  name: string,
  frontendUrl: string,
): MailMessage => ({
  to,
  subject: 'Votre boutique vendeur est validée',
  html: layout(
    'Félicitations, votre boutique est approuvée !',
    `<p>Bonjour ${name},</p>
     <p>Votre demande vendeur a été <strong>approuvée</strong>. Vous pouvez désormais publier vos produits.</p>
     <p><a href="${frontendUrl}/vendeur/produits" style="color:#7c5c43;">Accéder à mon espace vendeur</a></p>`,
  ),
});

export const sellerRejectedTemplate = (
  to: string,
  name: string,
  reason?: string | null,
): MailMessage => ({
  to,
  subject: 'Votre demande vendeur a été refusée',
  html: layout(
    'Demande vendeur refusée',
    `<p>Bonjour ${name},</p>
     <p>Votre demande vendeur n'a pas pu être acceptée.</p>
     ${reason ? `<p><strong>Motif :</strong> ${escapeHtml(reason)}</p>` : ''}
     <p>Vous pouvez corriger les informations manquantes et soumettre une nouvelle demande depuis votre espace.</p>`,
  ),
});

export const orderCreatedSellerTemplate = (payload: OrderCreatedSellerPayload): MailMessage => {
  const lines = payload.lines
    .map(
      (line) => `<li>${escapeHtml(line.name)} × ${line.quantity} — ${money(line.lineTotal)}</li>`,
    )
    .join('');

  return {
    to: payload.to,
    subject: `Nouvelle commande reçue — ${payload.orderNumber}`,
    html: layout(
      'Nouvelle commande reçue',
      `<p>Bonjour ${escapeHtml(payload.sellerName)},</p>
       <p>Une nouvelle commande contient vos produits.</p>
       <p><strong>Commande :</strong> ${escapeHtml(payload.orderNumber)}</p>
       <p><strong>Produits concernés :</strong></p>
       <ul>${lines}</ul>
       <p><strong>Montant vous revenant :</strong> ${money(payload.sellerAmount)}</p>
       <p><a href="${payload.frontendUrl}/vendeur/commandes" style="color:#7c5c43;">Consulter mon espace vendeur</a></p>`,
    ),
  };
};

export const paymentSubmittedTemplate = (
  to: string,
  name: string,
  orderNumber: string,
): MailMessage => ({
  to,
  subject: `Paiement reçu pour la commande ${orderNumber}`,
  html: layout(
    'Paiement en cours de vérification',
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Nous avons bien reçu la référence de votre paiement pour la commande <strong>${escapeHtml(orderNumber)}</strong>.</p>
     <p>Elle sera vérifiée par un administrateur avant validation définitive.</p>`,
  ),
});

export const paymentVerifiedTemplate = (
  to: string,
  name: string,
  orderNumber: string,
): MailMessage => ({
  to,
  subject: `Paiement vérifié — commande ${orderNumber}`,
  html: layout(
    'Paiement vérifié',
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Votre paiement pour la commande <strong>${escapeHtml(orderNumber)}</strong> a été vérifié. Votre commande est confirmée.</p>`,
  ),
});

export const paymentRejectedTemplate = (
  to: string,
  name: string,
  orderNumber: string,
  reason?: string | null,
): MailMessage => ({
  to,
  subject: `Paiement non validé — commande ${orderNumber}`,
  html: layout(
    'Paiement non validé',
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Le paiement de la commande <strong>${escapeHtml(orderNumber)}</strong> n'a pas pu être vérifié.</p>
     ${reason ? `<p><strong>Motif :</strong> ${escapeHtml(reason)}</p>` : ''}
     <p>Merci de soumettre une nouvelle référence de transaction.</p>`,
  ),
});

export const orderStatusTemplate = (
  to: string,
  name: string,
  orderNumber: string,
  statusLabel: string,
): MailMessage => ({
  to,
  subject: `Commande ${orderNumber} : ${statusLabel}`,
  html: layout(
    'Suivi de votre commande',
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Le statut de votre commande <strong>${escapeHtml(orderNumber)}</strong> est maintenant : <strong>${escapeHtml(statusLabel)}</strong>.</p>`,
  ),
});

export const passwordResetTemplate = (to: string, name: string, resetUrl: string): MailMessage => ({
  to,
  subject: 'Réinitialisation de votre mot de passe',
  html: layout(
    'Réinitialisation du mot de passe',
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Une demande de réinitialisation a été reçue. Utilisez le lien ci-dessous (valable 30 minutes) :</p>
     <p><a href="${resetUrl}" style="color:#7c5c43;">${resetUrl}</a></p>
     <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
  ),
});

export const lowStockTemplate = (
  to: string,
  sellerName: string,
  products: { name: string; stock: number }[],
): MailMessage => ({
  to,
  subject: 'Alerte stock faible',
  html: layout(
    'Stock faible sur vos produits',
    `<p>Bonjour ${escapeHtml(sellerName)},</p>
     <p>Les produits suivants ont atteint leur seuil de stock :</p>
     <ul>${products
       .map((p) => `<li>${escapeHtml(p.name)} — ${p.stock} restant(s)</li>`)
       .join('')}</ul>`,
  ),
});

function escapeHtml(value: string): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
