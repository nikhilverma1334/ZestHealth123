import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 bytes for aes-256-cbc
const ALGORITHM = 'aes-256-cbc';

function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  if (!text) return text;
  if (!text.includes(':')) return text; // fallback for unencrypted during dev
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  public extendedClient: any;

  constructor() {
    super();
    this.extendedClient = this.$extends({
      query: {
        patient: {
          async create({ args, query }) {
            if (args.data.phone) args.data.phone = encrypt(args.data.phone);
            if (args.data.name) args.data.name = encrypt(args.data.name);
            const result = await query(args);
            if (result.phone) result.phone = decrypt(result.phone);
            if (result.name) result.name = decrypt(result.name);
            return result;
          },
          async update({ args, query }) {
            if (args.data.phone && typeof args.data.phone === 'string') args.data.phone = encrypt(args.data.phone);
            if (args.data.name && typeof args.data.name === 'string') args.data.name = encrypt(args.data.name);
            const result = await query(args);
            if (result.phone) result.phone = decrypt(result.phone);
            if (result.name) result.name = decrypt(result.name);
            return result;
          },
          async findUnique({ args, query }) {
            if (args.where.phone) args.where.phone = encrypt(args.where.phone);
            const result = await query(args);
            if (result && result.phone) result.phone = decrypt(result.phone);
            if (result && result.name) result.name = decrypt(result.name);
            return result;
          },
          async findFirst({ args, query }) {
            if (args.where?.phone) args.where.phone = encrypt(args.where.phone as string);
            const result = await query(args);
            if (result && result.phone) result.phone = decrypt(result.phone);
            if (result && result.name) result.name = decrypt(result.name);
            return result;
          },
          async findMany({ args, query }) {
            const results = await query(args);
            return results.map(result => {
              if (result.phone) result.phone = decrypt(result.phone);
              if (result.name) result.name = decrypt(result.name);
              return result;
            });
          }
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
