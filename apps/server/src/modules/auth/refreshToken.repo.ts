export interface RefreshTokenRecord {
  tokenHash: string;
  userUid: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
}

export interface RefreshTokenRepo {
  create(record: Omit<RefreshTokenRecord, 'revokedAt' | 'replacedBy'>): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeIfActive(tokenHash: string, replacedBy: string | null, now: Date): Promise<boolean>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
}
