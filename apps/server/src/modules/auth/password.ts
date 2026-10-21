import argon2 from 'argon2';

export const hashPassword = (plain: string) => argon2.hash(plain);

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

//To prevent time attacks
export async function verifyAgainstDummy(plain: string): Promise<void> {
  dummyHash ??= argon2.hash('tunerush-dummy-hash');
  await verifyPassword(await dummyHash, plain);
}
