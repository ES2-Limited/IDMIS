import { Injectable } from '@nestjs/common';
import { TOTP, generateSecret, generateURI, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

@Injectable()
export class TotpService {
  private readonly cryptoPlugin = new NobleCryptoPlugin();
  private readonly base32Plugin = new ScureBase32Plugin();

  generateSecret(): string {
    return generateSecret({
      crypto: this.cryptoPlugin,
      base32: this.base32Plugin,
    });
  }

  generateOtpauthUrl(email: string, secret: string): string {
    return generateURI({
      issuer: 'TRIMING IDMIS',
      label: email,
      secret,
    });
  }

  async verifyToken(token: string, secret: string): Promise<boolean> {
    const totp = new TOTP({
      secret,
      crypto: this.cryptoPlugin,
      base32: this.base32Plugin,
    });
    try {
      const result = await totp.verify(token);
      return result.valid;
    } catch {
      return false;
    }
  }
}
