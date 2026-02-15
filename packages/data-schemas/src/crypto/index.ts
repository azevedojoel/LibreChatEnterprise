import 'dotenv/config';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { SignPayloadParams } from '~/types';

const { webcrypto } = crypto;

/** Use hex decoding for both key and IV for legacy methods */
const key = Buffer.from(process.env.CREDS_KEY ?? '', 'hex');
const iv = Buffer.from(process.env.CREDS_IV ?? '', 'hex');
const algorithm = 'AES-CBC';

export async function signPayload({
  payload,
  secret,
  expirationTime,
}: SignPayloadParams): Promise<string> {
  return jwt.sign(payload, secret!, { expiresIn: expirationTime });
}

export async function hashToken(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer).toString('hex');
}

/** --- Legacy v1/v2 Setup: AES-CBC with fixed key and IV --- */

/**
 * Encrypts a value using AES-CBC
 * @param value - The plaintext to encrypt
 * @returns The encrypted string in hex format
 */
export async function encrypt(value: string): Promise<string> {
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'encrypt',
  ]);
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const encryptedBuffer = await webcrypto.subtle.encrypt(
    { name: algorithm, iv: iv },
    cryptoKey,
    data,
  );
  return Buffer.from(encryptedBuffer).toString('hex');
}

/**
 * Decrypts an encrypted value using AES-CBC
 * @param encryptedValue - The encrypted string in hex format
 * @returns The decrypted plaintext
 */
export async function decrypt(encryptedValue: string): Promise<string> {
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'decrypt',
  ]);
  const encryptedBuffer = Buffer.from(encryptedValue, 'hex');
  const decryptedBuffer = await webcrypto.subtle.decrypt(
    { name: algorithm, iv: iv },
    cryptoKey,
    encryptedBuffer,
  );
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/** --- v2: AES-CBC with a random IV per encryption --- */

/**
 * Encrypts a value using AES-CBC with a random IV per encryption
 * @param value - The plaintext to encrypt
 * @returns The encrypted string with IV prepended (iv:ciphertext format)
 */
export async function encryptV2(value: string): Promise<string> {
  const gen_iv = webcrypto.getRandomValues(new Uint8Array(16));
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'encrypt',
  ]);
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const encryptedBuffer = await webcrypto.subtle.encrypt(
    { name: algorithm, iv: gen_iv },
    cryptoKey,
    data,
  );
  return Buffer.from(gen_iv).toString('hex') + ':' + Buffer.from(encryptedBuffer).toString('hex');
}

/**
 * Decrypts an encrypted value using AES-CBC with random IV
 * @param encryptedValue - The encrypted string in iv:ciphertext format
 * @returns The decrypted plaintext
 */
export async function decryptV2(encryptedValue: string): Promise<string> {
  const parts = encryptedValue.split(':');
  if (parts.length === 1) {
    return parts[0];
  }
  const gen_iv = Buffer.from(parts.shift() ?? '', 'hex');
  const encrypted = parts.join(':');
  const cryptoKey = await webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
    'decrypt',
  ]);
  const encryptedBuffer = Buffer.from(encrypted, 'hex');
  const decryptedBuffer = await webcrypto.subtle.decrypt(
    { name: algorithm, iv: gen_iv },
    cryptoKey,
    encryptedBuffer,
  );
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/** --- v3: AES-256-CTR using Node's crypto functions --- */
const algorithm_v3 = 'aes-256-ctr';

/**
 * Encrypts a value using AES-256-CTR.
 * Note: AES-256 requires a 32-byte key. Ensure that process.env.CREDS_KEY is a 64-character hex string.
 * @param value - The plaintext to encrypt.
 * @returns The encrypted string with a "v3:" prefix.
 */
export function encryptV3(value: string): string {
  if (key.length !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${key.length} bytes`);
  }
  const iv_v3 = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm_v3, key, iv_v3);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v3:${iv_v3.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an encrypted value using AES-256-CTR.
 * @param encryptedValue - The encrypted string with "v3:" prefix.
 * @returns The decrypted plaintext.
 */
export function decryptV3(encryptedValue: string): string {
  const parts = encryptedValue.split(':');
  if (parts[0] !== 'v3') {
    throw new Error('Not a v3 encrypted value');
  }
  const iv_v3 = Buffer.from(parts[1], 'hex');
  const encryptedText = Buffer.from(parts.slice(2).join(':'), 'hex');
  const decipher = crypto.createDecipheriv(algorithm_v3, key, iv_v3);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
}

/** --- Envelope encryption: unique DEK per ciphertext, KEK from CREDS_KEY --- */
const GCM_IV_LENGTH = 12;
const GCM_AUTH_TAG_LENGTH = 16;
const ENVELOPE_PREFIX = 'env:v1:';

function getKek(): Buffer {
  if (key.length !== 32) {
    throw new Error(`CREDS_KEY must be 64 hex chars (32 bytes) for envelope encryption, got ${key.length} bytes`);
  }
  return key;
}

/**
 * Encrypts a value using envelope encryption.
 * Each ciphertext uses a unique Data Encryption Key (DEK); DEK is encrypted with KEK (CREDS_KEY).
 * Format: env:v1:base64(iv_dek|cipher_dek|auth_tag_dek):base64(iv_data|cipher_data|auth_tag_data)
 */
export async function encryptEnvelope(value: string): Promise<string> {
  const kek = getKek();
  const dek = crypto.randomBytes(32);

  const ivData = crypto.randomBytes(GCM_IV_LENGTH);
  const cipherData = crypto.createCipheriv('aes-256-gcm', dek, ivData, { authTagLength: GCM_AUTH_TAG_LENGTH });
  const encData = Buffer.concat([cipherData.update(value, 'utf8'), cipherData.final(), cipherData.getAuthTag()]);
  const payloadData = Buffer.concat([ivData, encData]);

  const ivDek = crypto.randomBytes(GCM_IV_LENGTH);
  const cipherDek = crypto.createCipheriv('aes-256-gcm', kek, ivDek, { authTagLength: GCM_AUTH_TAG_LENGTH });
  const encDek = Buffer.concat([cipherDek.update(dek), cipherDek.final(), cipherDek.getAuthTag()]);
  const payloadDek = Buffer.concat([ivDek, encDek]);

  return `${ENVELOPE_PREFIX}${payloadDek.toString('base64')}:${payloadData.toString('base64')}`;
}

/**
 * Decrypts an envelope-encrypted value.
 */
export async function decryptEnvelope(encryptedValue: string): Promise<string> {
  const kek = getKek();
  const parts = encryptedValue.slice(ENVELOPE_PREFIX.length).split(':');
  if (parts.length < 2) {
    throw new Error('Invalid envelope format');
  }
  const payloadDek = Buffer.from(parts[0], 'base64');
  const payloadData = Buffer.from(parts[1], 'base64');

  const ivDek = payloadDek.subarray(0, GCM_IV_LENGTH);
  const encDek = payloadDek.subarray(GCM_IV_LENGTH, payloadDek.length - GCM_AUTH_TAG_LENGTH);
  const authTagDek = payloadDek.subarray(payloadDek.length - GCM_AUTH_TAG_LENGTH);
  const decipherDek = crypto.createDecipheriv('aes-256-gcm', kek, ivDek, { authTagLength: GCM_AUTH_TAG_LENGTH });
  decipherDek.setAuthTag(authTagDek);
  const dek = Buffer.concat([decipherDek.update(encDek), decipherDek.final()]);

  const ivData = payloadData.subarray(0, GCM_IV_LENGTH);
  const encData = payloadData.subarray(GCM_IV_LENGTH, payloadData.length - GCM_AUTH_TAG_LENGTH);
  const authTagData = payloadData.subarray(payloadData.length - GCM_AUTH_TAG_LENGTH);
  const decipherData = crypto.createDecipheriv('aes-256-gcm', dek, ivData, { authTagLength: GCM_AUTH_TAG_LENGTH });
  decipherData.setAuthTag(authTagData);
  return Buffer.concat([decipherData.update(encData), decipherData.final()]).toString('utf8');
}

/**
 * Decrypts any supported format (envelope, v2, v3, or legacy).
 * Use for reads when the stored format may vary.
 */
export async function decryptUniversal(encryptedValue: string): Promise<string> {
  if (typeof encryptedValue !== 'string' || !encryptedValue) {
    throw new Error('Expected non-empty string to decrypt');
  }
  if (encryptedValue.startsWith(ENVELOPE_PREFIX)) {
    return decryptEnvelope(encryptedValue);
  }
  if (encryptedValue.startsWith('v3:')) {
    return decryptV3(encryptedValue);
  }
  if (encryptedValue.includes(':') && encryptedValue.split(':').length >= 2 && !encryptedValue.startsWith('v3')) {
    return decryptV2(encryptedValue);
  }
  return decrypt(encryptedValue);
}

/**
 * Generates random values as a hex string
 * @param length - The number of random bytes to generate
 * @returns The random values as a hex string
 */
export async function getRandomValues(length: number): Promise<string> {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer');
  }
  const randomValues = new Uint8Array(length);
  webcrypto.getRandomValues(randomValues);
  return Buffer.from(randomValues).toString('hex');
}

/**
 * Computes SHA-256 hash for the given input.
 * @param input - The input to hash.
 * @returns The SHA-256 hash of the input.
 */
export async function hashBackupCode(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
