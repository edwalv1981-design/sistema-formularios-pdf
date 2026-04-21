const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = require('docx');

/**
 * Genera un archivo Word (.docx) a partir de datos estructurados.
 * @param {string} title - El título del documento.
 * @param {Array} data - Lista de objetos { id, val } con el contenido.
 * @returns {Promise<Buffer>} - El buffer del archivo Word generado.
 */
async function generateWord(title, data) {
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    text: title,
                    heading: HeadingLevel.HEADING_1,
                    spacing: { after: 400 },
                }),
                new Table({
                    width: {
                        size: 100,
                        type: WidthType.PERCENTAGE,
                    },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Campo", bold: true })] })] }),
                                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Valor", bold: true })] })] }),
                            ],
                        }),
                        ...data.map(item => new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph(item.id || "")] }),
                                new TableCell({ children: [new Paragraph(item.val || "")] }),
                            ],
                        })),
                    ],
                }),
            ],
        }],
    });

    return await Packer.toBuffer(doc);
}

module.exports = { generateWord };
