import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getSetting, setSetting } from './db';

const COOKIE_NAME = 'bs_session';
const JWT_TTL = '30d';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function ownerPasswordHash(): Promise<string | null> {
  return getSetting<string | null>('owner_password_hash', null);
}

export async function setOwnerPasswordHash(hash: string): Promise<void> {
  await setSetting('owner_password_hash', hash);
}

/** JWT secret is generated once and kept in settings (server-side only). */
async function getJwtSecret(): Promise<Uint8Array> {
  let secret = await getSetting<string | null>('jwt_secret', null);
  if (!secret) {
    secret = randomBytes(32).toString('hex');
    await setSetting('jwt_secret', secret);
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(): Promise<string> {
  const secret = await getJwtSecret();
  return new SignJWT({ sub: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_TTL)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = await getJwtSecret();
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Fastify preHandler: require a valid owner session (cookie or bearer). */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const bearer = req.headers.authorization;
  const token =
    (bearer && bearer.startsWith('Bearer ') ? bearer.slice(7) : null) ||
    (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
  if (!token || !(await verifyToken(token))) {
    reply.code(401).send({ error: 'Unauthorized' });
    throw new Error('unauthorized');
  }
}
