import aiosmtplib
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from config import settings

async def send_otp_email(to_email: str, otp_code: str):
    message = EmailMessage()
    message["From"] = formataddr(("ExamRepo Support", settings.SMTP_EMAIL))
    message["To"] = to_email
    message["Reply-To"] = settings.SMTP_EMAIL
    message["Subject"] = "Verify your email address"
    message["Message-ID"] = make_msgid(domain="examrepo.app")
    
    html_content = f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #333333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
    <p>Hello,</p>
    <p>Thank you for signing up for Exam Repository. Please use the verification code below to complete your registration. This code will expire in 5 minutes.</p>
    <div style="background-color: #f4f4f5; padding: 16px 24px; border-radius: 8px; margin: 24px 0; display: inline-block;">
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #111827;">{otp_code}</span>
    </div>
    <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 32px;">
        If you did not request this verification code, please safely ignore this email.
    </p>
</body>
</html>"""
    
    text_content = (
        f"Hello,\\n\\n"
        f"Your Exam Repository verification code is: {otp_code}\\n\\n"
        f"This code will expire in 5 minutes.\\n\\n"
        f"If you did not request this, please ignore this email."
    )
    message.set_content(text_content)
    message.add_alternative(html_content, subtype='html')

    await aiosmtplib.send(
        message,
        hostname="smtp.gmail.com",
        port=465,
        use_tls=True,
        username=settings.SMTP_EMAIL,
        password=settings.SMTP_PASSWORD,
    )
