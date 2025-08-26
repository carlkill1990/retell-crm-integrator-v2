import crypto from 'crypto';
import { config } from '../config';

const algorithm = 'aes-256-cbc';
const key = Buffer.from(config.encryption.key, 'hex');

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted text format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bcrypt = require('bcryptjs');
    bcrypt.hash(password, 12, (err: Error, hash: string) => {
      if (err) reject(err);
      else resolve(hash);
    });
  });
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const bcrypt = require('bcryptjs');
    bcrypt.compare(password, hash, (err: Error, result: boolean) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}