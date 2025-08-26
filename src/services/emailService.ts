import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../config/logger';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.smtpHost,
      port: config.email.smtpPort,
      secure: config.email.smtpPort === 465,
      auth: {
        user: config.email.smtpUser,
        pass: config.email.smtpPass,
      },
    });
  }

  async sendEmail(data: {
    to: string;
    subject: string;
    template: string;
    data: any;
  }) {
    try {
      const htmlContent = this.getEmailTemplate(data.template, data.data);
      
      const mailOptions = {
        from: config.email.fromEmail,
        to: data.to,
        subject: data.subject,
        html: htmlContent,
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully to ${data.to}`);
      return result;
    } catch (error) {
      logger.error('Email sending failed:', error);
      throw error;
    }
  }

  private getEmailTemplate(template: string, data: any): string {
    switch (template) {
      case 'sync_success':
        return this.syncSuccessTemplate(data);
      case 'sync_error':
        return this.syncErrorTemplate(data);
      default:
        return `<p>Template ${template} not found</p>`;
    }
  }

  private syncSuccessTemplate(data: any): string {
    return `
      <h2>Integration Success</h2>
      <p>Hello ${data.userName},</p>
      <p>Your integration "${data.integrationName}" has successfully processed a sync event.</p>
      <ul>
        <li><strong>Event Type:</strong> ${data.eventType}</li>
        <li><strong>Processed At:</strong> ${data.processedAt}</li>
        ${data.callId ? `<li><strong>Call ID:</strong> ${data.callId}</li>` : ''}
      </ul>
      <p>Best regards,<br>Retell Sync Team</p>
    `;
  }

  private syncErrorTemplate(data: any): string {
    return `
      <h2>Integration Error</h2>
      <p>Hello ${data.userName},</p>
      <p>Your integration "${data.integrationName}" encountered an error.</p>
      <ul>
        <li><strong>Error:</strong> ${data.errorMessage}</li>
        <li><strong>Event Type:</strong> ${data.eventType}</li>
        <li><strong>Retry Count:</strong> ${data.retryCount}</li>
        <li><strong>Failed At:</strong> ${data.failedAt}</li>
      </ul>
      <p>Please check your integration settings or contact support if this persists.</p>
      <p>Best regards,<br>Retell Sync Team</p>
    `;
  }
}

export const emailService = new EmailService();