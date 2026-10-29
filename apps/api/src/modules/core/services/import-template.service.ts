import { Injectable, BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { WUA_IMPORT_DEFINITION, type ImportDatasetDefinition } from '@idmis/contracts';

@Injectable()
export class ImportTemplateService {
  private readonly definitions: Record<string, ImportDatasetDefinition> = {
    wua: WUA_IMPORT_DEFINITION,
  };

  getDefinition(dataset: string): ImportDatasetDefinition {
    const def = this.definitions[dataset];
    if (!def) {
      throw new BadRequestException(`Unknown dataset template: '${dataset}'`);
    }
    return def;
  }

  async generateTemplateBuffer(dataset: string): Promise<Buffer> {
    const def = this.getDefinition(dataset);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TRIMING IDMIS 2.0';
    workbook.created = new Date();

    // 1. Data Entry Sheet
    const dataSheet = workbook.addWorksheet('Data', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    dataSheet.columns = def.columns.map((col) => ({
      header: `${col.header}${col.required ? ' *' : ''}`,
      key: col.name,
      width: Math.max(col.header.length + 6, 18),
    }));

    // Style Header Row
    const headerRow = dataSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' }, // Slate Blue #1e3a8a
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    // Add example row as row 2
    const exampleValues: Record<string, unknown> = {};
    for (const col of def.columns) {
      if (col.example !== undefined) {
        exampleValues[col.name] = col.example;
      } else if (col.type === 'string') {
        exampleValues[col.name] = `Example ${col.header}`;
      } else if (col.type === 'number') {
        exampleValues[col.name] = 100;
      } else if (col.type === 'boolean') {
        exampleValues[col.name] = true;
      }
    }
    if (dataset === 'wua') {
      exampleValues.name = 'Kano Central WUA';
      exampleValues.regNo = 'WUA-KN-001';
      exampleValues.level = 'unit';
      exampleValues.schemeCode = 'KRIS';
      exampleValues.wardCode = 'KURA-W-01';
      exampleValues.address = 'KM 12 Zaria Road, Kano';
      exampleValues.bankName = 'First Bank';
      exampleValues.bankAccountNumber = '1234567890';
      exampleValues.isOperational = true;
      exampleValues.hasMaintenanceFund = true;
    }
    const row2 = dataSheet.addRow(exampleValues);
    row2.font = { italic: true, color: { argb: 'FF64748B' } };

    // 2. Instructions Sheet
    const infoSheet = workbook.addWorksheet('Instructions');
    infoSheet.columns = [
      { header: 'Column Name', key: 'header', width: 25 },
      { header: 'Field Key', key: 'name', width: 20 },
      { header: 'Required', key: 'required', width: 12 },
      { header: 'Data Type', key: 'type', width: 15 },
      { header: 'Description / Allowed Values', key: 'description', width: 45 },
    ];

    const infoHeader = infoSheet.getRow(1);
    infoHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    infoHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' }, // Teal
    };
    infoHeader.height = 24;

    for (const col of def.columns) {
      infoSheet.addRow({
        header: col.header,
        name: col.name,
        required: col.required ? 'YES' : 'NO',
        type: col.type,
        description: col.description || '-',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
