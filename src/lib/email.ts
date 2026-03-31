import { Resend } from 'resend';
import { STAGE_INFO, type Stage } from './stage';

const resend = new Resend(import.meta.env.RESEND_API_KEY as string);

const FROM = 'The Trip Culling Game <noreply@trip-culling-game.lucaskruger.com>';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderGameEmail(params: {
  title: string;
  intro?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const intro = params.intro ? `<p style="color:#8888aa;font-size:12px;margin:0 0 24px;">${escapeHtml(params.intro)}</p>` : '';
  const cta = params.ctaLabel && params.ctaUrl
    ? `
      <div style="margin-top:28px;">
        <a
          href="${escapeHtml(params.ctaUrl)}"
          style="display:inline-block;background:#ff6b35;color:#000;text-decoration:none;padding:14px 18px;border:3px solid #000;box-shadow:4px 4px 0 #000;font-size:12px;letter-spacing:1px;font-weight:bold;"
        >
          ${escapeHtml(params.ctaLabel)}
        </a>
      </div>
    `
    : '';

  return `
    <div style="background:#0f0e17;color:#f0f0ff;padding:32px 20px;font-family:'Courier New',monospace;">
      <div style="max-width:560px;margin:0 auto;background:#1e1b36;border:3px solid #ffd700;box-shadow:6px 6px 0 #000;padding:28px;">
        <div style="text-align:center;margin-bottom:24px;line-height:1.1;">
          <div style="font-size:13px;letter-spacing:6px;color:#8888aa;margin-bottom:10px;">the <span style="color:#ffd700;">trip</span></div>
          <div style="font-size:28px;letter-spacing:3px;color:#ff6b35;text-shadow:4px 4px 0 #7a2000,2px 2px 0 #000;">CULLING GAME</div>
        </div>
        <div style="font-size:18px;color:#ffd700;letter-spacing:1px;margin-bottom:12px;">${escapeHtml(params.title)}</div>
        ${intro}
        <div style="font-size:14px;line-height:1.8;color:#f0f0ff;">
          ${params.bodyHtml}
        </div>
        ${cta}
      </div>
    </div>
  `;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  await sendEmail(
    email,
    'Your login code — The Trip Culling Game',
    renderGameEmail({
      title: 'LOGIN CODE',
      intro: 'Your login code is below.',
      bodyHtml: `
        <div style="text-align:center;">
          <div style="display:inline-block;background:linear-gradient(180deg,#ffd700 0%,#ffb800 100%);border:3px solid #000;padding:18px 26px;box-shadow:6px 6px 0 #000;border-radius:4px;font-size:32px;letter-spacing:10px;color:#2b1200;font-weight:bold;">
            ${escapeHtml(code)}
          </div>
        </div>
        <p style="color:#8888aa;font-size:11px;margin-top:24px;">Expires in 15 minutes. Do not share this code.</p>
      `,
    }),
  );
}

export async function sendRemovalNotification(
  email: string,
  destinationName: string,
  reason: string,
): Promise<void> {
  await sendEmail(
    email,
    'Your destination was removed — The Trip Culling Game',
    renderGameEmail({
      title: 'DESTINATION REMOVED',
      bodyHtml: `
        <p style="margin:0 0 16px;">Your destination <strong style="color:#ff6b35;">${escapeHtml(destinationName)}</strong> has been removed by an admin.</p>
        <div style="background:#0f0e17;border-left:4px solid #ff3366;padding:16px;margin-bottom:16px;">
          <strong style="color:#ff3366;">Reason:</strong>
          <p style="margin:8px 0 0;">${escapeHtml(reason)}</p>
        </div>
        <p style="color:#8888aa;font-size:12px;margin:0;">If the submission phase is still open, you may propose a new destination.</p>
      `,
    }),
  );
}

export async function sendAdminRevealCode(email: string, destinationName: string, code: string): Promise<void> {
  await sendEmail(
    email,
    'Admin reveal code — The Trip Culling Game',
    renderGameEmail({
      title: 'ADMIN REVEAL CODE',
      intro: 'A request was made to reveal a destination creator.',
      bodyHtml: `
        <p style="color:#ff6b35;font-size:16px;margin:0 0 24px;">${escapeHtml(destinationName)}</p>
        <div style="text-align:center;">
          <div style="display:inline-block;background:linear-gradient(180deg,#ffd700 0%,#ffb800 100%);border:3px solid #000;padding:18px 26px;box-shadow:6px 6px 0 #000;border-radius:4px;font-size:32px;letter-spacing:10px;color:#2b1200;font-weight:bold;">
            ${escapeHtml(code)}
          </div>
        </div>
        <p style="color:#8888aa;font-size:11px;margin-top:24px;">Expires in 15 minutes. Only use this if you intentionally want to reveal the player identity.</p>
      `,
    }),
  );
}

export async function sendInvitationEmail(
  email: string,
  params: { gameUrl: string; invitedBy: string; isAdmin: boolean },
): Promise<void> {
  await sendEmail(
    email,
    'You were invited — The Trip Culling Game',
    renderGameEmail({
      title: 'YOU ARE IN THE GAME',
      intro: `${params.invitedBy} added you to The Trip Culling Game.`,
      bodyHtml: `
        <p style="margin:0 0 16px;">Your role: <strong style="color:#00d4ff;">${params.isAdmin ? 'ADMIN' : 'PLAYER'}</strong></p>
        <p style="margin:0;">Open the game, request your login code, and join the current round.</p>
      `,
      ctaLabel: 'ENTER THE GAME',
      ctaUrl: params.gameUrl,
    }),
  );
}

export async function sendPhaseUpdateNotification(
  email: string,
  params: { stage: Stage; gameUrl: string; customIntro?: string },
): Promise<void> {
  const stageInfo = STAGE_INFO[params.stage];
  await sendEmail(
    email,
    `${stageInfo.label} — The Trip Culling Game`,
    renderGameEmail({
      title: stageInfo.label,
      intro: params.customIntro ?? 'The game has moved into a new phase.',
      bodyHtml: `<p style="margin:0;">${escapeHtml(stageInfo.description)}</p>`,
      ctaLabel: 'OPEN THE GAME',
      ctaUrl: params.gameUrl,
    }),
  );
}

export async function sendWinnerAnnouncement(
  email: string,
  params: {
    gameUrl: string;
    winnerName: string;
    winnerPoints: number;
    secondPlaceName?: string | null;
    thirdPlaceName?: string | null;
  },
): Promise<void> {
  const placementLines = [
    `<p style="margin:0 0 12px;"><strong style="color:#ffd700;">🥇 1st:</strong> ${escapeHtml(params.winnerName)} (${params.winnerPoints} pts)</p>`,
    params.secondPlaceName
      ? `<p style="margin:0 0 12px;"><strong style="color:#d8d8e8;">🥈 2nd:</strong> ${escapeHtml(params.secondPlaceName)}</p>`
      : '',
    params.thirdPlaceName
      ? `<p style="margin:0;"><strong style="color:#c98a4a;">🥉 3rd:</strong> ${escapeHtml(params.thirdPlaceName)}</p>`
      : '',
  ].filter(Boolean).join('');

  await sendEmail(
    email,
    `Winner decided: ${params.winnerName} — The Trip Culling Game`,
    renderGameEmail({
      title: 'WINNER DECIDED',
      intro: 'The culling is complete. The points have spoken.',
      bodyHtml: `
        <div style="background:#0f0e17;border:3px solid #ffd700;padding:18px;margin-bottom:20px;">
          ${placementLines}
        </div>
        <p style="margin:0;">Pack your bags. The winning destination is locked in.</p>
      `,
      ctaLabel: 'SEE THE RESULTS',
      ctaUrl: params.gameUrl,
    }),
  );
}
