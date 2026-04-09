// ─── Buchhalter custom routes ───────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { parseUpload, processFile } = require('../../core/file-processor');

function register(theme, serveTemplate) {
  const templatesDir = theme.templatesDir;

  return function handleRoute(req, res, url) {

    // Dashboard JSON API
    if (req.method === 'GET' && url === '/api/dashboard-data') {
      const currentYear = new Date().getFullYear();
      const totals = db.getYearTotals(currentYear);
      const summary = db.getTransactionSummaryByYear(currentYear);
      const taxRelevant = db.getTaxRelevantByYear(currentYear).slice(0, 20);
      const recentDocs = db.getRecentDocuments(5);
      const sessionCount = db.getSessionCount();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        year: currentYear,
        totalIncome: (totals.total_income || 0).toFixed(2),
        totalExpenses: Math.abs(totals.total_expenses || 0).toFixed(2),
        transactionCount: totals.transaction_count || 0,
        sessionCount,
        summary,
        taxRelevant,
        documents: recentDocs
      }));
      return true;
    }

    // Dashboard/reports — serve the SPA shell (for direct URL access)
    if (req.method === 'GET' && (url === '/dashboard' || url === '/reports')) {
      // Let the default handler serve chat.html — the SPA router handles it
      return false;
    }

    // File upload
    if (req.method === 'POST' && url === '/upload') {
      parseUpload(req).then(fileData => {
        return processFile(fileData);
      }).then(result => {
        const docId = db.addDocument({
          filename: result.filename,
          originalName: result.originalName,
          fileType: result.fileType,
          processed: false,
          transactionCount: 0
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          fileId: docId,
          fileName: result.originalName,
          fileType: result.fileType,
          preview: result.preview
        }));
      }).catch(err => {
        console.error('Upload failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
      return true;
    }

    // Reports — XLSX download for a year
    if (req.method === 'GET' && url.startsWith('/reports/year/')) {
      const year = parseInt(url.split('/').pop(), 10);
      if (isNaN(year)) {
        res.writeHead(400).end('Invalid year');
        return true;
      }

      generateReport(year).then(buffer => {
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="buchhalter_${year}.xlsx"`
        });
        res.end(buffer);
      }).catch(err => {
        console.error('Report generation failed:', err);
        res.writeHead(500).end('Report generation failed');
      });
      return true;
    }

    // Reports JSON API
    if (req.method === 'GET' && url === '/api/reports-data') {
      const currentYear = new Date().getFullYear();
      const years = [];
      for (let y = currentYear; y >= currentYear - 5; y--) {
        const totals = db.getYearTotals(y);
        if (totals.transaction_count > 0) {
          years.push({ year: y, ...totals });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ years }));
      return true;
    }

    return false;
  };
}

async function generateReport(year) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: All transactions
  const allSheet = workbook.addWorksheet('Alle Transaktionen');
  allSheet.columns = [
    { header: 'Datum', key: 'date', width: 12 },
    { header: 'Beschreibung', key: 'description', width: 40 },
    { header: 'Betrag (€)', key: 'amount', width: 14 },
    { header: 'Kategorie', key: 'category', width: 20 },
    { header: 'Steuerrelevant', key: 'tax_relevant', width: 14 },
    { header: 'Steuerkategorie', key: 'tax_category', width: 30 },
    { header: 'Quelle', key: 'source', width: 15 },
    { header: 'Notizen', key: 'notes', width: 30 }
  ];
  const allTx = db.getTransactionsByYear(year);
  allTx.forEach(tx => {
    allSheet.addRow({
      ...tx,
      tax_relevant: tx.tax_relevant ? 'Ja' : 'Nein'
    });
  });

  // Sheet 2: Summary by category
  const summarySheet = workbook.addWorksheet('Zusammenfassung');
  summarySheet.columns = [
    { header: 'Kategorie', key: 'category', width: 25 },
    { header: 'Einnahmen (€)', key: 'income', width: 16 },
    { header: 'Ausgaben (€)', key: 'expenses', width: 16 },
    { header: 'Anzahl', key: 'count', width: 10 }
  ];
  const summary = db.getTransactionSummaryByYear(year);
  summary.forEach(s => {
    summarySheet.addRow({
      category: s.category || 'Unkategorisiert',
      income: s.income || 0,
      expenses: Math.abs(s.expenses || 0),
      count: s.count
    });
  });

  // Sheet 3: Tax-relevant items
  const taxSheet = workbook.addWorksheet('Steuerrelevant');
  taxSheet.columns = [
    { header: 'Datum', key: 'date', width: 12 },
    { header: 'Beschreibung', key: 'description', width: 40 },
    { header: 'Betrag (€)', key: 'amount', width: 14 },
    { header: 'Kategorie', key: 'category', width: 20 },
    { header: 'Steuerkategorie', key: 'tax_category', width: 30 }
  ];
  const taxTx = db.getTaxRelevantByYear(year);
  taxTx.forEach(tx => taxSheet.addRow(tx));

  // Sheet 4: Crypto transactions
  const cryptoSheet = workbook.addWorksheet('Crypto');
  cryptoSheet.columns = [
    { header: 'Datum', key: 'date', width: 12 },
    { header: 'Beschreibung', key: 'description', width: 40 },
    { header: 'Betrag (€)', key: 'amount', width: 14 },
    { header: 'Kategorie', key: 'category', width: 20 },
    { header: 'Steuerkategorie', key: 'tax_category', width: 30 },
    { header: 'Notizen', key: 'notes', width: 30 }
  ];
  const cryptoTx = db.getCryptoTransactionsByYear(year);
  cryptoTx.forEach(tx => cryptoSheet.addRow(tx));

  return workbook.xlsx.writeBuffer();
}

module.exports = { register };
