import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ExpenseByCategory {
  category: string;
  totalAmount: number;
  count: number;
}

interface MonthlyTrend {
  month: string;
  totalExpenses: number;
  count: number;
}

interface RevenueVsExpense {
  totalExpenses: number;
  totalRevenue: number;
  profit: number;
  profitMargin: number;
  expenseCount: number;
  revenueCount: number;
}

interface FinancialSummary {
  totalExpenses: number;
  avgExpense: number;
  maxExpense: number;
  minExpense: number;
  count: number;
}

interface FinancialReportData {
  expenseByCategory: ExpenseByCategory[];
  monthlyTrends: MonthlyTrend[];
  revenueVsExpense: RevenueVsExpense;
  summary: FinancialSummary;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  userName?: string;
}

export function generateFinancialReportPDF(data: FinancialReportData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = 20;

  // Helper function to format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  // Helper function to check if we need a new page
  const checkNewPage = (requiredSpace: number) => {
    if (yPosition + requiredSpace > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      yPosition = 20;
      return true;
    }
    return false;
  };

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Financial Report', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 10;

  // Date range
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (data.dateRange?.startDate || data.dateRange?.endDate) {
    const dateText = `Period: ${data.dateRange.startDate || 'All time'} to ${data.dateRange.endDate || 'Present'}`;
    doc.text(dateText, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 6;
  }

  // Generated date
  const generatedDate = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Generated: ${generatedDate}`, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 10;

  // User name
  if (data.userName) {
    doc.text(`User: ${data.userName}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;
  }

  // Summary Section
  checkNewPage(60);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Financial Summary', 14, yPosition);
  yPosition += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const summaryData = [
    ['Total Expenses', formatCurrency(data.summary.totalExpenses), `${data.summary.count} transactions`],
    ['Total Revenue', formatCurrency(data.revenueVsExpense.totalRevenue), `${data.revenueVsExpense.revenueCount} harvests`],
    ['Net Profit', formatCurrency(data.revenueVsExpense.profit), `${data.revenueVsExpense.profitMargin.toFixed(1)}% margin`],
    ['Average Expense', formatCurrency(data.summary.avgExpense), ''],
    ['Min Expense', formatCurrency(data.summary.minExpense), ''],
    ['Max Expense', formatCurrency(data.summary.maxExpense), ''],
  ];

  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Value', 'Details']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: [66, 139, 202] },
    margin: { left: 14, right: 14 },
  });

  yPosition = (doc as any).lastAutoTable.finalY + 15;

  // Expenses by Category
  checkNewPage(60);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Expenses by Category', 14, yPosition);
  yPosition += 8;

  if (data.expenseByCategory && data.expenseByCategory.length > 0) {
    const categoryData = data.expenseByCategory.map((item) => [
      item.category,
      formatCurrency(item.totalAmount),
      item.count.toString(),
      ((item.totalAmount / data.summary.totalExpenses) * 100).toFixed(1) + '%',
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Category', 'Total Amount', 'Transactions', '% of Total']],
      body: categoryData,
      theme: 'striped',
      headStyles: { fillColor: [66, 139, 202] },
      margin: { left: 14, right: 14 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('No expense data available', 14, yPosition);
    yPosition += 15;
  }

  // Monthly Trends
  checkNewPage(60);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Monthly Expense Trends', 14, yPosition);
  yPosition += 8;

  if (data.monthlyTrends && data.monthlyTrends.length > 0) {
    const trendsData = data.monthlyTrends.map((item) => [
      item.month,
      formatCurrency(item.totalExpenses),
      item.count.toString(),
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Month', 'Total Expenses', 'Transactions']],
      body: trendsData,
      theme: 'striped',
      headStyles: { fillColor: [66, 139, 202] },
      margin: { left: 14, right: 14 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('No monthly trend data available', 14, yPosition);
    yPosition += 15;
  }

  // Revenue vs Expense Analysis
  checkNewPage(40);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Revenue vs Expense Analysis', 14, yPosition);
  yPosition += 8;

  const analysisData = [
    ['Total Revenue', formatCurrency(data.revenueVsExpense.totalRevenue)],
    ['Total Expenses', formatCurrency(data.revenueVsExpense.totalExpenses)],
    ['Net Profit/Loss', formatCurrency(data.revenueVsExpense.profit)],
    ['Profit Margin', `${data.revenueVsExpense.profitMargin.toFixed(2)}%`],
  ];

  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Value']],
    body: analysisData,
    theme: 'grid',
    headStyles: { fillColor: [66, 139, 202] },
    margin: { left: 14, right: 14 },
  });

  yPosition = (doc as any).lastAutoTable.finalY + 15;

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  // Save the PDF
  const fileName = `financial-report-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
