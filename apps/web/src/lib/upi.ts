export interface UpiParams {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}

const UPI_ID_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

export function isValidUpiId(id: string): boolean {
  return UPI_ID_RE.test(id.trim());
}

/** `upi://pay?pa=<id>&pn=<name>&am=<amount>&cu=INR&tn=<note>` */
export function buildUpiLink({ upiId, payeeName, amount, note }: UpiParams): string {
  const params = [
    ['pa', upiId.trim()],
    ['pn', payeeName.trim()],
    ['am', amount.toFixed(2)],
    ['cu', 'INR'],
  ];
  if (note) params.push(['tn', note.slice(0, 50)]);
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

export function formatInr(amount: number | null | undefined): string {
  if (amount == null) return '';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}
