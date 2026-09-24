import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { truncateHash, formatDateTime } from './utils';

export function exportCaseToPDF(
  caseData: any, 
  evidenceList: any[], 
  documents: any[], 
  diaryEntries: any[], 
  certificates: any[], 
  readinessPercent: number,
  reports: any[]
) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(16);
  doc.text('CASE PREPARATION RECORD & CERTIFICATE', 14, 20);
  doc.setFontSize(10);
  doc.text('SYSTEM-GENERATED / SUBJECT TO OFFICIAL VERIFICATION & APPROVAL', 14, 26);
  
  // Case Info
  doc.setFontSize(12);
  doc.text(`Case: ${caseData.case_number} - ${caseData.title}`, 14, 40);
  doc.setFontSize(10);
  doc.text(`Jurisdiction: ${caseData.jurisdiction} | Status: ${caseData.status} | Readiness: ${readinessPercent}%`, 14, 46);
  doc.text(`Summary: ${caseData.summary}`, 14, 52);

  let y = 60;

  // Documents
  (doc as any).autoTable({
    startY: y,
    head: [['Document', 'Type', 'Hash']],
    body: documents.map(d => [d.title, d.doc_type, truncateHash(d.sha256_hash, 16)]),
    theme: 'grid',
    styles: { fontSize: 8 }
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Evidence
  (doc as any).autoTable({
    startY: y,
    head: [['Evidence ID', 'Title', 'Integrity Hash']],
    body: evidenceList.map(e => [e.tracking_number, e.title, truncateHash(e.sha256_hash, 16)]),
    theme: 'grid',
    styles: { fontSize: 8 }
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (y > 220) { doc.addPage(); y = 20; }

  // Reports
  (doc as any).autoTable({
    startY: y,
    head: [['Report Type', 'Title', 'Status', 'Date']],
    body: reports.map(r => [r.report_type, r.title, r.status, formatDateTime(r.created_at)]),
    theme: 'grid',
    styles: { fontSize: 8 }
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (y > 220) { doc.addPage(); y = 20; }

  // Investigation Diary
  (doc as any).autoTable({
    startY: y,
    head: [['Diary Entry Date', 'Content Snippet']],
    body: diaryEntries.map(d => [formatDateTime(d.created_at), d.content.slice(0, 80) + '...']),
    theme: 'grid',
    styles: { fontSize: 8 }
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (y > 220) { doc.addPage(); y = 20; }
  
  // Certificates
  doc.setFontSize(12);
  doc.text('ELECTRONIC RECORD CERTIFICATES', 14, y);
  y += 10;
  
  if (certificates.length === 0) {
    doc.setFontSize(9);
    doc.text('No certificates generated.', 14, y);
    y += 10;
  } else {
    certificates.forEach(cert => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(9);
      doc.text(`Certifier: ${cert.certifier_name} (${cert.certifier_title})`, 14, y);
      doc.text(`Statement: ${cert.statement}`, 14, y + 6);
      doc.text(`Date: ${new Date(cert.certification_date).toLocaleString()}`, 14, y + 12);
      y += 24;
    });
  }

  // Footer Disclaimer
  doc.setFontSize(8);
  doc.text('This document does NOT claim legal admissibility or government certification under Federal Rules of Evidence.', 14, 290);

  doc.save(`Case_${caseData.case_number}_Export.pdf`);
}
