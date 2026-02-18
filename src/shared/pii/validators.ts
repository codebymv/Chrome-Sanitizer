export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function isLikelyCreditCard(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

export function isLikelyIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    const parsed = Number(part);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
  });
}

export function hasContextLabel(match: string, label: string): boolean {
  const normalized = match.toLowerCase();
  return normalized.includes(label.toLowerCase());
}

export function isLikelyExpiry(value: string): boolean {
  const cleaned = value.replace(/\s/g, '');
  const matched = cleaned.match(/(0[1-9]|1[0-2])[\/-](\d{2}|\d{4})/);
  if (!matched) {
    return false;
  }

  const month = Number(matched[1]);
  return month >= 1 && month <= 12;
}
