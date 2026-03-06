/**
 * Check if email configuration is set
 * @returns Returns `true` if Postmark, Mailgun, or SMTP is properly configured
 */
export function checkEmailConfig(): boolean {
  const hasPostmarkConfig =
    !!process.env.POSTMARK_API_KEY && !!(process.env.POSTMARK_FROM || process.env.EMAIL_FROM);

  const hasMailgunConfig =
    !!process.env.MAILGUN_API_KEY && !!process.env.MAILGUN_DOMAIN && !!process.env.EMAIL_FROM;

  const hasSMTPConfig =
    (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
    !!process.env.EMAIL_USERNAME &&
    !!process.env.EMAIL_PASSWORD &&
    !!process.env.EMAIL_FROM;

  return hasPostmarkConfig || hasMailgunConfig || hasSMTPConfig;
}
