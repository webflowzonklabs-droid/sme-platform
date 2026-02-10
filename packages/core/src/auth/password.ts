import argon2 from "argon2";

// ============================================
// Password Hashing — argon2id
// ============================================

/**
 * Hash a password using argon2id.
 * Uses recommended parameters for security.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a password against a stored hash.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // If the hash is malformed, return false
    return false;
  }
}
