// ─── File upload + parsing ──────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function parseUpload(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    let fileData = null;

    busboy.on('file', (fieldname, file, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      file.on('data', chunk => chunks.push(chunk));
      file.on('end', () => {
        fileData = {
          buffer: Buffer.concat(chunks),
          originalName: filename,
          mimeType,
          ext: path.extname(filename).toLowerCase().replace('.', '')
        };
      });
    });

    busboy.on('finish', () => {
      if (!fileData) return reject(new Error('No file uploaded'));
      resolve(fileData);
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}

async function processFile(fileData) {
  const { buffer, originalName, ext } = fileData;

  // Save to uploads dir
  const timestamp = Date.now();
  const safeBase = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${timestamp}_${safeBase}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filepath, buffer);

  let preview = '';
  let fileType = ext;

  if (ext === 'csv') {
    preview = await processCSV(buffer);
    fileType = 'csv';
  } else if (ext === 'pdf') {
    preview = await processPDF(buffer);
    fileType = 'pdf';
  } else if (ext === 'xlsx' || ext === 'xls') {
    preview = await processXLSX(buffer);
    fileType = 'xlsx';
  } else if (['md', 'txt', 'json'].includes(ext)) {
    const text = buffer.toString('utf-8');
    preview = text.length > 2000 ? text.substring(0, 2000) + '\n...[truncated]' : text;
    fileType = ext;
  } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
    // Images are sent as base64 to Claude's vision — return base64 for injection
    preview = `[Image: ${originalName}]`;
    fileType = 'image';
  }

  return { filename, originalName, fileType, preview, filepath };
}

async function processCSV(buffer) {
  const csvParser = require('csv-parser');
  const { Readable } = require('stream');

  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer.toString('utf-8'));

    stream
      .pipe(csvParser({ separator: detectSeparator(buffer.toString('utf-8')) }))
      .on('data', row => {
        if (rows.length < 20) rows.push(row);
      })
      .on('end', () => {
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        const lines = [`Columns: ${headers.join(', ')}`, `Rows shown: ${rows.length}`, ''];
        rows.forEach(row => {
          lines.push(headers.map(h => `${h}: ${row[h]}`).join(' | '));
        });
        resolve(lines.join('\n'));
      })
      .on('error', reject);
  });
}

function detectSeparator(text) {
  const firstLine = text.split('\n')[0] || '';
  if (firstLine.includes(';')) return ';'; // Common in German bank CSVs
  if (firstLine.includes('\t')) return '\t';
  return ',';
}

async function processPDF(buffer) {
  const pdfParse = require('pdf-parse');
  const result = await pdfParse(buffer);
  const text = result.text || '';
  // Return first ~2000 chars as preview
  return text.length > 2000
    ? text.substring(0, 2000) + '\n...[truncated]'
    : text;
}

async function processXLSX(buffer) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const lines = [];
  workbook.eachSheet(sheet => {
    lines.push(`Sheet: ${sheet.name}`);
    let rowCount = 0;
    sheet.eachRow((row, rowNumber) => {
      if (rowCount >= 20) return;
      lines.push(row.values.slice(1).join(' | ')); // slice(1) because exceljs is 1-indexed
      rowCount++;
    });
    lines.push('');
  });

  return lines.join('\n');
}

function getImageBase64(filepath) {
  const buffer = fs.readFileSync(filepath);
  const ext = path.extname(filepath).toLowerCase();
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
  const mediaType = mimeMap[ext] || 'image/jpeg';
  return { data: buffer.toString('base64'), mediaType };
}

module.exports = { parseUpload, processFile, getImageBase64 };
