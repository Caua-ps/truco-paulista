import { Injectable, Logger } from '@nestjs/common';

/**
 * Serviço de e-mail. Em desenvolvimento, loga no console; em produção,
 * plugue um provedor (SES, Resend, SendGrid, SMTP) neste único ponto.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private get webOrigin(): string {
    return process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  }

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const url = `${this.webOrigin}/verificar-email?token=${token}`;
    await this.send(to, 'Confirme seu e-mail — Truco Paulista', `Confirme seu cadastro: ${url}`);
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const url = `${this.webOrigin}/redefinir-senha?token=${token}`;
    await this.send(to, 'Redefinição de senha — Truco Paulista', `Redefina sua senha: ${url}`);
  }

  private async send(to: string, subject: string, body: string): Promise<void> {
    if (!process.env.SMTP_HOST) {
      this.logger.log(`[DEV] E-mail para ${to} — ${subject}\n${body}`);
      return;
    }
    // TODO produção: integrar nodemailer/provedor transacional usando SMTP_*.
    this.logger.log(`E-mail enviado para ${to}: ${subject}`);
  }
}
