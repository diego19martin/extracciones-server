const generarYEnviarReporte = async () => {
    try {
        // Primero, genera el reporte
        const [result] = await pool.query('SELECT * FROM `listado` WHERE comentario IS NOT NULL AND comentario != ""');
        
        if (result.length === 0) {
            console.log('No hay máquinas con comentarios para generar el reporte.');
            return;
        }

        // Crear un workbook y agregar los datos
        const worksheet = XLSX.utils.json_to_sheet(result);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Extracciones');

        // Definir la ruta para guardar el archivo Excel
        const reportDir = path.resolve('reportes');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir);
        }
        const reportFilePath = path.join(reportDir, 'reporte_extracciones.xlsx');
        XLSX.writeFile(workbook, reportFilePath);

        console.log('Reporte generado exitosamente:', reportFilePath);

        // Enviar el correo con el reporte adjunto
        await enviarCorreoReporte(reportFilePath);
    } catch (error) {
        console.error('Error al generar y enviar el reporte:', error);
    }
};

// Función para enviar el reporte por correo electrónico
const enviarCorreoReporte = async (filePath) => {
    try {
        // Configurar el transporte del correo
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'tu_email@gmail.com',
                pass: 'tu_contraseña', // Usa una contraseña de aplicación
            },
        });

        // Configurar los detalles del correo
        const mailOptions = {
            from: 'tu_email@gmail.com',
            to: 'destinatario@correo.com',
            subject: 'Reporte de Extracciones de Máquinas',
            text: 'Adjunto encontrarás el reporte de las máquinas con comentarios o novedades.',
            attachments: [
                {
                    filename: 'reporte_extracciones.xlsx',
                    path: filePath,
                },
            ],
        };

        // Enviar el correo
        await transporter.sendMail(mailOptions);
        console.log('Correo enviado exitosamente.');
    } catch (error) {
        console.error('Error al enviar el correo:', error);
    }
};
