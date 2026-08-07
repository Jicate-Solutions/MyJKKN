/**
 * Field validators shared by staff bulk upload (create) and staff bulk edit (update).
 *
 * Extracted from bulk-upload-staff.tsx on 2026-08-07 so the two flows cannot drift on
 * what counts as a valid phone number or a parseable date. The regexes are unchanged —
 * do not "tighten" them here without checking the upload path still accepts real data.
 */

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  return /^\+?[\d\s-()]{10,}$/.test(phone);
}

export interface ParsedDate {
  isValid: boolean;
  convertedDate: string; // YYYY-MM-DD
  error?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function parseFlexibleDate(value: unknown): ParsedDate {
  // xlsx with `cellDates: true` hands back a real Date.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      isValid: true,
      convertedDate: `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
    };
  }

  // Excel serial date (days since 1900-01-01, with the 1900-leap-year bug adjustment).
  // bulk-upload-staff.tsx reads workbooks via `XLSX.read(data)` with no `cellDates`
  // option, so real date cells arrive as raw numbers, not JS Dates or strings — this
  // branch is what makes actual .xlsx uploads work. Preserved from the original parser.
  if (
    typeof value === 'number' ||
    (value != null && value !== '' && !Number.isNaN(Number(value)) && Number(value) > 1000)
  ) {
    const excelEpoch = new Date(1900, 0, 1);
    const serialNumber = Number(value);
    const adjustedSerial = serialNumber > 59 ? serialNumber - 1 : serialNumber;
    const converted = new Date(excelEpoch.getTime() + (adjustedSerial - 1) * 24 * 60 * 60 * 1000);

    if (!Number.isNaN(converted.getTime())) {
      const year = converted.getFullYear();
      const currentYear = new Date().getFullYear();
      if (year < 1900 || year > currentYear + 1) {
        return {
          isValid: false,
          convertedDate: '',
          error: `Year must be between 1900 and ${currentYear + 1}. Got: ${year}`
        };
      }
      return {
        isValid: true,
        convertedDate: `${year}-${pad(converted.getMonth() + 1)}-${pad(converted.getDate())}`
      };
    }
    // Not a usable serial number — fall through to text parsing.
  }

  const raw = value == null ? '' : String(value).trim();
  if (raw === '') {
    return { isValid: false, convertedDate: '', error: 'Date is required' };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { isValid: true, convertedDate: raw };
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY — day first, matching the existing upload path.
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = Number(d);
    const month = Number(m);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { isValid: true, convertedDate: `${y}-${pad(month)}-${pad(day)}` };
    }
    // Second segment can't be a month (e.g. "05/25/1990") — retry as MM/DD/YYYY.
    // Preserved from the original parser's US-format fallback.
    if (day >= 1 && day <= 12 && month >= 1 && month <= 31) {
      return { isValid: true, convertedDate: `${y}-${pad(day)}-${pad(month)}` };
    }
    return { isValid: false, convertedDate: '', error: `Out-of-range date: ${raw}` };
  }

  // YYYY/MM/DD
  const ymd = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return { isValid: true, convertedDate: `${y}-${pad(Number(m))}-${pad(Number(d))}` };
  }

  return {
    isValid: false,
    convertedDate: '',
    error: `Unrecognised date "${raw}". Use YYYY-MM-DD or DD/MM/YYYY.`
  };
}
