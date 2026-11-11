import type { MailMessage } from '../mail.service';

const money = (value: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value) + ' MGA';

const BRAND_GOLD = '#C49A3C';
const BRAND_DARK = '#121214';
const BRAND_BG = '#F9F6EF';

const layout = (title: string, body: string): string => `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:${BRAND_BG};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1A1A1E;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <tr><td style="background:${BRAND_DARK};padding:20px 28px;color:#fff;border-bottom:4px solid ${BRAND_GOLD};">
            <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;">Crea<span style="color:${BRAND_GOLD};">New</span> <span style="font-weight:400;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#C8A251;margin-left:8px;">Canapés d'Angle</span></div>
            <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#C9C5BF;margin-top:4px;">Confort absolu · Design moderne · Qualité durable</div>
          </td></tr>
          <tr><td style="padding:28px;">
            <h1 style="margin:0 0 16px;font-size:20px;color:${BRAND_DARK};">${title}</h1>
            <div style="font-size:15px;line-height:1.6;color:#4a423c;">${body}</div>
          </td></tr>
          <tr><td style="padding:18px 28px;background:#FFFBF5;color:#8a7f75;font-size:12px;border-top:1px solid #EDE4D2;">
            Cet e-mail est automatique, merci de ne pas y répondre. — CreaNew, Ankorondrano, Antananarivo<br>
            <span style="color:${BRAND_GOLD};">Donnez une nouvelle vie à votre salon</span>
          </td></tr>
        </table>
        <div style="margin-top:16px;text-align:center;font-size:11px;color:#9C9790;">© 2026 CreaNew — Canapés d'Angle · Antananarivo, Madagascar</div>
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
  subject: 'Bienvenue chez CreaNew — Canapés d’Angle',
  html: layout(
    `Bienvenue ${escapeHtml(name)} !`,
    `<p>Merci d’avoir rejoint CreaNew, le spécialiste du canapé d’angle à Madagascar.</p>
     <p>Parcourez nos collections et trouvez le canapé qui donnera une nouvelle vie à votre salon.</p>
     <p><a href="${frontendUrl}/boutique" style="color:${BRAND_GOLD};">Découvrir les canapés d’angle</a></p>`,
  ),
});

export const sellerPendingTemplate = (to: string, name: string): MailMessage => ({
  to,
  subject: 'Votre demande vendeur CreaNew a bien été reçue',
  html: layout(
    'Demande en cours de validation',
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Votre demande pour devenir vendeur CreaNew a bien été enregistrée. Un administrateur va l'examiner.</p>
     <p>Vous serez notifié dès que votre boutique sera validée.</p>`,
  ),
});

export const sellerApprovedTemplate = (
  to: string,
  name: string,
  frontendUrl: string,
): MailMessage => ({
  to,
  subject: 'Votre boutique CreaNew est validée',
  html: layout(
    'Félicitations, votre boutique est approuvée !',
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Votre demande vendeur a été <strong>approuvée</strong>. Vous pouvez désormais publier vos canapés.</p>
     <p><a href="${frontendUrl}/vendeur/produits" style="color:${BRAND_GOLD};">Accéder à mon espace vendeur</a></p>`,
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
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Votre demande vendeur n'a pas pu être acceptée.</p>
     ${reason ? `<p><strong>Motif :</strong> ${escapeHtml(reason)}</p>` : ''}
     <p>Vous pouvez corriger les informations et soumettre une nouvelle demande depuis votre espace.</p>`,
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
    subject: `Nouvelle commande CreaNew — ${payload.orderNumber}`,
    html: layout(
      'Nouvelle commande reçue',
      `<p>Bonjour ${escapeHtml(payload.sellerName)},</p>
       <p>Une nouvelle commande contient vos produits.</p>
       <p><strong>Commande :</strong> ${escapeHtml(payload.orderNumber)}</p>
       <p><strong>Produits concernés :</strong></p>
       <ul>${lines}</ul>
       <p><strong>Montant vous revenant :</strong> ${money(payload.sellerAmount)}</p>
       <p><a href="${payload.frontendUrl}/vendeur/commandes" style="color:${BRAND_GOLD};">Consulter mon espace vendeur</a></p>`,
    ),
  };
};

export const paymentSubmittedTemplate = (
  to: string,
  name: string,
  orderNumber: string,
): MailMessage => ({
  to,
  subject: `Paiement reçu — commande ${orderNumber}`,
  html: layout(
    'Paiement en cours de vérification',
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Nous avons bien reçu la référence de votre paiement pour la commande <strong>${escapeHtml(orderNumber)}</strong>.</p>
     <p>Elle sera vérifiée par notre équipe avant validation définitive.</p>`,
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
     <p>Votre paiement pour la commande <strong>${escapeHtml(orderNumber)}</strong> a été vérifié. Votre commande est confirmée et en préparation.</p>`,
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
  subject: 'Réinitialisation de votre mot de passe CreaNew',
  html: layout(
    'Réinitialisation du mot de passe',
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Une demande de réinitialisation a été reçue. Utilisez le lien ci-dessous (valable 30 minutes) :</p>
     <p><a href="${resetUrl}" style="color:${BRAND_GOLD};">${resetUrl}</a></p>
     <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
  ),
});

export const lowStockTemplate = (
  to: string,
  sellerName: string,
  products: { name: string; stock: number }[],
): MailMessage => ({
  to,
  subject: 'Alerte stock faible — CreaNew',
  html: layout(
    'Stock faible sur vos produits',
    `<p>Bonjour ${escapeHtml(sellerName)},</p>
     <p>Les produits suivants ont atteint leur seuil de stock :</p>
     <ul>${products
       .map((p) => `<li>${escapeHtml(p.name)} — ${p.stock} restant(s)</li>`)
       .join('')}</ul>`,
  ),
});

// ── CreaNew — Contact

export const contactAckTemplate = (to: string, name: string, subject: string): MailMessage => ({
  to,
  subject: `CreaNew — Accusé de réception : ${subject}`,
  html: layout(
    'Merci pour votre message',
    `<p>Bonjour ${escapeHtml(name)},</p>
     <p>Nous avons bien reçu votre message <strong>« ${escapeHtml(subject)} »</strong>.</p>
     <p>Notre équipe vous répond sous 24 h. Pour un échange plus rapide, vous pouvez aussi utiliser la <a href="/messages" style="color:${BRAND_GOLD};">messagerie CreaNew</a>.</p>
     <p>— L’équipe CreaNew, Ankorondrano, Antananarivo</p>`,
  ),
});

export const contactAdminTemplate = (
  to: string,
  visitorName: string,
  visitorEmail: string,
  subject: string,
  message: string,
  frontendUrl: string,
): MailMessage => ({
  to,
  subject: `Nouveau message contact — ${subject}`,
  html: layout(
    'Nouveau message de contact',
    `<p>Nouveau message reçu via le formulaire CreaNew :</p>
     <p><strong>De :</strong> ${escapeHtml(visitorName)} &lt;${escapeHtml(visitorEmail)}&gt;</p>
     <p><strong>Sujet :</strong> ${escapeHtml(subject)}</p>
     <p><strong>Message :</strong></p>
     <blockquote style="border-left:3px solid ${BRAND_GOLD};padding-left:12px;color:#2b2622;">${escapeHtml(message).replace(/\n/g, '<br>')}</blockquote>
     <p><a href="${frontendUrl}/admin/contact" style="color:${BRAND_GOLD};">Voir dans l’administration</a></p>`,
  ),
});

export const conversationMessageTemplate = (
  to: string,
  recipientName: string,
  subject: string,
  body: string,
  frontendUrl: string,
  conversationId: string,
): MailMessage => ({
  to,
  subject: `Nouveau message — ${subject}`,
  html: layout(
    'Nouveau message dans votre conversation',
    `<p>Bonjour ${escapeHtml(recipientName)},</p>
     <p>Vous avez reçu un nouveau message dans <strong>${escapeHtml(subject)}</strong> :</p>
     <blockquote style="border-left:3px solid ${BRAND_GOLD};padding-left:12px;">${escapeHtml(body).replace(/\n/g, '<br>')}</blockquote>
     <p><a href="${frontendUrl}/messages/${conversationId}" style="color:${BRAND_GOLD};">Répondre sur CreaNew</a></p>`,
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
