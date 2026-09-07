import bcrypt from 'bcrypt';
import { env } from '../config/env';

export const password = {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
  },

  async compare(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  },
};
