import { Injectable } from "@nestjs/common";
import { Resend } from "resend";

@Injectable()
export class MailService {
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly webOrigin: string;
  private readonly enabled: boolean;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.MAIL_FROM?.trim();
    const webOrigin = process.env.WEB_ORIGIN?.trim();

    // Automated tests must never send real email.
    this.enabled =
      process.env.NODE_ENV !== "test" &&
      process.env.MAIL_DELIVERY_ENABLED !== "false";

    if (!this.enabled) {
      this.resend = null;
      this.from = from ?? "";
      this.webOrigin = webOrigin?.replace(/\/$/, "") ?? "";
      return;
    }

    if (!apiKey) {
      throw new Error("RESEND_API_KEY is required.");
    }

    if (!from) {
      throw new Error("MAIL_FROM is required.");
    }

    if (!webOrigin) {
      throw new Error("WEB_ORIGIN is required.");
    }

    this.resend = new Resend(apiKey);
    this.from = from;
    this.webOrigin = webOrigin.replace(/\/$/, "");
  }

  async sendVerificationEmail(email: string, token: string) {
    if (!this.enabled || !this.resend) {
      return;
    }

    const verificationUrl =
      `${this.webOrigin}/verify-email?token=${encodeURIComponent(token)}`;

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: [email],
      subject: "Xác thực tài khoản Ms Ngan Eco",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Xác thực tài khoản Ms Ngan Eco</h2>

          <p>Bạn vừa đăng ký tài khoản trên hệ thống Ms Ngan Eco.</p>

          <p>Nhấn vào nút bên dưới để xác thực địa chỉ email:</p>

          <p>
            <a
              href="${verificationUrl}"
              style="
                display:inline-block;
                padding:12px 20px;
                background:#111827;
                color:#ffffff;
                text-decoration:none;
                border-radius:6px;
              "
            >
              Xác thực email
            </a>
          </p>

          <p>Liên kết này có hiệu lực trong 24 giờ.</p>

          <p>
            Nếu bạn không thực hiện đăng ký này, bạn có thể bỏ qua email.
          </p>
        </div>
      `,
    });

    if (error) {
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }

  async sendPasswordResetEmail(email: string, token: string) {
    if (!this.enabled || !this.resend) return;
    const resetUrl = `${this.webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: [email],
      subject: "Đặt lại mật khẩu Ms Ngân English",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Đặt lại mật khẩu</h2><p>Nhấn vào nút bên dưới để tạo mật khẩu mới.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#111827;color:#fff;text-decoration:none;border-radius:6px">Đặt lại mật khẩu</a></p><p>Liên kết có hiệu lực trong 30 phút. Nếu bạn không yêu cầu thay đổi này, hãy bỏ qua email.</p></div>`,
    });
    if (error) throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}
