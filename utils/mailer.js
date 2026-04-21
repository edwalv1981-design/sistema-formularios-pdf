const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendExpirationEmail(to, name, date) {
    try {
        const mailOptions = {
            from: `"PDFNova Security" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: '¡Alerta de Documento Expirado! - PDFNova',
            html: `
                <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h2 style="color: #0ea5e9;">PDFNova AI Agent</h2>
                    </div>
                    <p>Hola <strong>${name}</strong>,</p>
                    <p>Nuestro Agente de Vigilancia ha detectado que uno de tus documentos personales ha <strong>EXPIRADO</strong>.</p>
                    <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
                        <p style="margin: 0; color: #991b1b;"><strong>Fecha de Expiración detectada:</strong> ${date}</p>
                    </div>
                    <p>Es indispensable que procedas a actualizar este documento a la brevedad para garantizar la continuidad de tus trámites legales.</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                    <p style="font-size: 0.8rem; color: #64748b; text-align: center;">Este es un mensaje automático generado por PDFNova. No respondas a este correo.</p>
                </div>
            `
        };

        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            await transporter.sendMail(mailOptions);
            console.log(`[MAIL] Correo enviado a ${to}`);
        } else {
            console.warn('[MAIL] No se enviará correo: Credenciales no configuradas en .env');
        }
    } catch (err) {
        console.error('[MAIL_ERROR]', err);
    }
}

module.exports = { sendExpirationEmail };
