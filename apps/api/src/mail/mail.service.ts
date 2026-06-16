import { Injectable, Logger } from '@nestjs/common';
import type { Transporter } from 'nodemailer';

/**
 * Serviço de e-mail transacional.
 *
 * Sem `SMTP_HOST` (desenvolvimento), apenas loga o conteúdo no console.
 * Com SMTP configurado, envia de verdade via nodemailer — funciona com
 * qualquer provedor (Resend, SES, SendGrid, Postmark, Gmail) que exponha SMTP.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private transporterReady = false;

  private get webOrigin(): string {
    return process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  }

  private get from(): string {
    return process.env.MAIL_FROM ?? 'Truco Paulista <no-reply@trucopaulista.app>';
  }

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const url = `${this.webOrigin}/verificar-email?token=${token}`;
    await this.send(
      to,
      'Confirme seu e-mail — Truco Paulista',
      this.template({
        heading: 'Quase lá!',
        body: 'Confirme seu e-mail para liberar sua conta no Truco Paulista e entrar na mesa.',
        cta: 'Confirmar e-mail',
        url,
      }),
      `Confirme seu cadastro abrindo: ${url}`,
    );
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const url = `${this.webOrigin}/redefinir-senha?token=${token}`;
    await this.send(
      to,
      'Redefinição de senha — Truco Paulista',
      this.template({
        heading: 'Redefinir senha',
        body: 'Recebemos um pedido para redefinir sua senha. Se não foi você, ignore este e-mail.',
        cta: 'Criar nova senha',
        url,
      }),
      `Redefina sua senha abrindo: ${url}`,
    );
  }

  /** Cria (uma vez) o transporter a partir das variáveis SMTP_*. */
  private async getTransporter(): Promise<Transporter | null> {
    if (this.transporterReady) return this.transporter;
    this.transporterReady = true;

    if (!process.env.SMTP_HOST) return null;
    // Import dinâmico: nodemailer só é carregado quando há SMTP configurado.
    const nodemailer = await import('nodemailer');
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    return this.transporter;
  }

  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    const transporter = await this.getTransporter();
    if (!transporter) {
      this.logger.log(`[DEV] E-mail para ${to} — ${subject}\n${text}`);
      return;
    }
    try {
      await transporter.sendMail({ from: this.from, to, subject, text, html });
      this.logger.log(`E-mail enviado para ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail para ${to}`, err as Error);
      throw err;
    }
  }

  /** Template HTML simples e responsivo, com a paleta verde/dourada do jogo. */
  private template(opts: { heading: string; body: string; cta: string; url: string }): string {
    return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#0c1410;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e7e7e7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#13211a;border:1px solid rgba(212,175,55,.25);border-radius:16px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <div style="font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#d4af37;font-weight:700;">Truco Paulista</div>
            <h1 style="margin:12px 0 8px;font-size:22px;color:#fff;">${opts.heading}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#c7d0c9;">${opts.body}</p>
            <a href="${opts.url}" style="display:inline-block;background:#1a6b3c;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:10px;border:1px solid #d4af37;">${opts.cta}</a>
            <p style="margin:24px 0 0;font-size:12px;color:#7c887f;word-break:break-all;">Ou copie e cole no navegador:<br>${opts.url}</p>
          </td></tr>
          <tr><td style="padding:18px 32px 28px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:#6b766e;">
            Este link expira em breve. Se você não solicitou, pode ignorar esta mensagem com segurança.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  }
}
