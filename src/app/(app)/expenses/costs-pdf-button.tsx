'use client';

import { useState } from 'react';

export type PdfTripRow = {
  dateLabel: string;
  routeLabel: string;
  vehicleLabel: string;
  revenueLabel: string;
  expenseLabel: string;
  profitLabel: string;
};

export type PdfServiceRow = {
  dateLabel: string;
  categoryLabel: string;
  vehicleLabel: string;
  costLabel: string;
};

export function CostsPdfButton({
  title,
  generatedLabel,
  tripSectionTitle,
  serviceSectionTitle,
  summaryTripLabel,
  summaryServiceLabel,
  summaryTotalLabel,
  summaryTripValue,
  summaryServiceValue,
  summaryTotalValue,
  trips,
  services,
  revenueWord,
  expenseWord,
  profitWord,
  buttonLabel,
}: {
  title: string;
  generatedLabel: string;
  tripSectionTitle: string;
  serviceSectionTitle: string;
  summaryTripLabel: string;
  summaryServiceLabel: string;
  summaryTotalLabel: string;
  summaryTripValue: string;
  summaryServiceValue: string;
  summaryTotalValue: string;
  trips: PdfTripRow[];
  services: PdfServiceRow[];
  revenueWord: string;
  expenseWord: string;
  profitWord: string;
  buttonLabel: string;
}) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const marginX = 40;
      const pageH = doc.internal.pageSize.getHeight();
      const lineH = 16;
      let y = 50;

      const ensureSpace = (need = lineH) => {
        if (y + need > pageH - 40) {
          doc.addPage();
          y = 50;
        }
      };

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(title, marginX, y);
      y += 22;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(generatedLabel, marginX, y);
      y += 22;

      doc.setFontSize(11);
      doc.text(`${summaryTripLabel}: ${summaryTripValue}`, marginX, y);
      y += lineH;
      doc.text(`${summaryServiceLabel}: ${summaryServiceValue}`, marginX, y);
      y += lineH;
      doc.setFont('helvetica', 'bold');
      doc.text(`${summaryTotalLabel}: ${summaryTotalValue}`, marginX, y);
      doc.setFont('helvetica', 'normal');
      y += lineH + 10;

      if (trips.length > 0) {
        ensureSpace(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(tripSectionTitle, marginX, y);
        doc.setFont('helvetica', 'normal');
        y += 18;
        doc.setFontSize(9);
        for (const r of trips) {
          ensureSpace(lineH * 3);
          doc.setFont('helvetica', 'bold');
          doc.text(`${r.dateLabel}  ·  ${r.routeLabel}`, marginX, y);
          doc.setFont('helvetica', 'normal');
          y += lineH;
          doc.text(r.vehicleLabel, marginX + 10, y);
          y += lineH;
          doc.text(
            `${revenueWord}: ${r.revenueLabel}    ${expenseWord}: ${r.expenseLabel}    ${profitWord}: ${r.profitLabel}`,
            marginX + 10,
            y,
          );
          y += lineH + 6;
        }
      }

      if (services.length > 0) {
        ensureSpace(24);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(serviceSectionTitle, marginX, y);
        doc.setFont('helvetica', 'normal');
        y += 18;
        doc.setFontSize(9);
        for (const r of services) {
          ensureSpace(lineH);
          doc.text(`${r.dateLabel}  ·  ${r.categoryLabel}  ·  ${r.vehicleLabel}  ·  ${r.costLabel}`, marginX, y);
          y += lineH;
        }
      }

      doc.save('costs.pdf');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-base font-semibold hover:bg-muted-soft disabled:opacity-60"
    >
      {buttonLabel}
    </button>
  );
}
