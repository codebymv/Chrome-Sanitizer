import type { DetectedMatch } from '../types';

type RandomFn = () => number;

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: string): RandomFn {
  let state = hashString(seed) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: RandomFn, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomDigit(random: RandomFn): string {
  return String(randomInt(random, 0, 9));
}

function randomLetter(random: RandomFn, uppercase: boolean): string {
  const base = uppercase ? 65 : 97;
  return String.fromCharCode(base + randomInt(random, 0, 25));
}

function replaceByCharacterClass(template: string, random: RandomFn): string {
  let result = '';
  for (const char of template) {
    if (/\d/.test(char)) {
      result += randomDigit(random);
      continue;
    }
    if (/[a-z]/.test(char)) {
      result += randomLetter(random, false);
      continue;
    }
    if (/[A-Z]/.test(char)) {
      result += randomLetter(random, true);
      continue;
    }
    result += char;
  }
  return result;
}

function enforceLength(value: string, source: string, random: RandomFn): string {
  if (value.length === source.length) {
    return value;
  }
  if (value.length > source.length) {
    return value.slice(0, source.length);
  }

  let output = value;
  for (let index = value.length; index < source.length; index += 1) {
    const sourceChar = source[index] ?? 'x';
    if (/\d/.test(sourceChar)) {
      output += randomDigit(random);
      continue;
    }
    if (/[a-z]/.test(sourceChar)) {
      output += randomLetter(random, false);
      continue;
    }
    if (/[A-Z]/.test(sourceChar)) {
      output += randomLetter(random, true);
      continue;
    }
    output += sourceChar === ' ' ? ' ' : 'x';
  }
  return output;
}

function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (doubleDigit) {
      value *= 2;
      if (value > 9) {
        value -= 9;
      }
    }
    sum += value;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function makeLuhnInvalid(digits: string): string {
  if (!isLuhnValid(digits)) {
    return digits;
  }
  const last = Number(digits[digits.length - 1] ?? '0');
  const replacement = (last + 1) % 10;
  return `${digits.slice(0, -1)}${replacement}`;
}

function fillDigitsTemplate(template: string, digits: string): string {
  let output = '';
  let pointer = 0;
  for (const char of template) {
    if (/\d/.test(char)) {
      output += digits[pointer] ?? '0';
      pointer += 1;
      continue;
    }
    output += char;
  }
  return output;
}

function replaceDateOfBirth(value: string, random: RandomFn): string {
  const separator = value.includes('-') ? '-' : '/';
  const parts = value.split(/[\/-]/);
  if (parts.length !== 3) {
    return replaceByCharacterClass(value, random);
  }

  const month = String(randomInt(random, 1, 12)).padStart(parts[0]?.length ?? 2, '0');
  const day = String(randomInt(random, 1, 28)).padStart(parts[1]?.length ?? 2, '0');
  const yearLength = parts[2]?.length ?? 4;
  const yearBase = yearLength === 2 ? randomInt(random, 10, 89) : randomInt(random, 1970, 2004);
  const year = String(yearBase).padStart(yearLength, '0').slice(-yearLength);
  return `${month}${separator}${day}${separator}${year}`;
}

function replaceExpiry(value: string): string {
  const separator = value.includes('-') ? '-' : '/';
  const yearPart = value.split(/[\/-]/)[1] ?? '00';
  return `00${separator}${'0'.repeat(Math.max(2, yearPart.length)).slice(0, yearPart.length)}`;
}

function replacePhone(value: string, random: RandomFn): string {
  const digitsCount = value.replace(/\D/g, '').length;
  const digits: string[] = [];
  for (let index = 0; index < digitsCount; index += 1) {
    digits.push(randomDigit(random));
  }

  if (digits.length >= 10) {
    digits[0] = '5';
    digits[1] = '5';
    digits[2] = '5';
    digits[3] = '0';
    digits[4] = '1';
  }

  return fillDigitsTemplate(value, digits.join(''));
}

function replaceEmail(value: string, random: RandomFn): string {
  const replaced = replaceByCharacterClass(value, random)
    .replace(/@/g, '@')
    .replace(/\./g, '.');

  const atIndex = value.indexOf('@');
  if (atIndex < 1) {
    return replaced;
  }

  const chars = replaced.split('');
  chars[atIndex] = '@';
  const dotIndex = value.lastIndexOf('.');
  if (dotIndex > atIndex) {
    chars[dotIndex] = '.';
  }
  return chars.join('');
}

function replaceFinancialLike(value: string, random: RandomFn): string {
  const digitsCount = value.replace(/\D/g, '').length;
  let digits = '';
  for (let index = 0; index < digitsCount; index += 1) {
    digits += randomDigit(random);
  }
  digits = makeLuhnInvalid(digits);
  return fillDigitsTemplate(value, digits);
}

function replaceRouting(value: string, random: RandomFn): string {
  const digitsCount = value.replace(/\D/g, '').length;
  let digits = '';
  for (let index = 0; index < digitsCount; index += 1) {
    digits += randomDigit(random);
  }
  if (digitsCount === 9) {
    const first = digits.slice(0, 8);
    const check = Number(digits[8] ?? '0');
    const invalidCheck = (check + 1) % 10;
    digits = `${first}${invalidCheck}`;
  }
  return fillDigitsTemplate(value, digits);
}

function replaceSsn(value: string, random: RandomFn): string {
  if (value.includes('-')) {
    return `000-00-${String(randomInt(random, 1000, 9999))}`;
  }
  return `00000${String(randomInt(random, 1000, 9999))}`;
}

function replaceName(value: string, random: RandomFn): string {
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  const consonants = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'y', 'z'];

  const buildWord = (length: number, uppercaseFirst: boolean): string => {
    let word = '';
    for (let index = 0; index < length; index += 1) {
      const source = index % 2 === 0 ? consonants : vowels;
      const next = source[randomInt(random, 0, source.length - 1)] ?? 'x';
      word += index === 0 && uppercaseFirst ? next.toUpperCase() : next;
    }
    return word;
  };

  return value
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) {
        return part;
      }
      if (part.length === 2 && part.endsWith('.')) {
        return `${randomLetter(random, true)}.`;
      }
      const uppercaseFirst = /[A-Z]/.test(part[0] ?? '');
      return buildWord(part.length, uppercaseFirst);
    })
    .join('');
}

export function generateSafeReplacement(match: DetectedMatch): string {
  const random = createRandom(`${match.key}|${match.value}|${match.index}`);
  let candidate: string;

  switch (match.key) {
    case 'fullNameContextual':
      candidate = replaceName(match.value, random);
      break;
    case 'dob':
      candidate = replaceDateOfBirth(match.value, random);
      break;
    case 'email':
      candidate = replaceEmail(match.value, random);
      break;
    case 'phone':
      candidate = replacePhone(match.value, random);
      break;
    case 'creditCard':
      candidate = replaceFinancialLike(match.value, random);
      break;
    case 'cardExpiry':
      candidate = replaceExpiry(match.value);
      break;
    case 'cvv':
      candidate = '0'.repeat(match.value.length);
      break;
    case 'routingNumber':
      candidate = replaceRouting(match.value, random);
      break;
    case 'ssn':
      candidate = replaceSsn(match.value, random);
      break;
    case 'bankAccount':
      candidate = fillDigitsTemplate(match.value, `0000${'0'.repeat(Math.max(0, match.value.replace(/\D/g, '').length - 4))}`);
      break;
    default:
      candidate = replaceByCharacterClass(match.value, random);
      break;
  }

  return enforceLength(candidate, match.value, random);
}
