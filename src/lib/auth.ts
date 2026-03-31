import { randomUUID } from 'crypto';

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateSessionToken(): string {
  return randomUUID();
}
