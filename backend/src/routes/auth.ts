import bcrypt from 'bcrypt';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { env } from '../env';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  company_name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(userId: string) {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '7d' });
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, company_name } = registerSchema.parse(req.body);

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) throw new ApiError(409, 'Email already registered');

    const password_hash = await bcrypt.hash(password, 10);
    const { data: user, error } = await supabase
      .from('users')
      .insert({ email, password_hash, company_name })
      .select('id, email, company_name, plan')
      .single();
    if (error || !user) throw new ApiError(500, error?.message ?? 'Failed to create user');

    const token = signToken(user.id);
    res.status(201).json({ user, jwt_token: token });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const { data: user } = await supabase
      .from('users')
      .select('id, email, company_name, plan, password_hash')
      .eq('email', email)
      .maybeSingle();
    if (!user) throw new ApiError(401, 'Invalid email or password');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new ApiError(401, 'Invalid email or password');

    const token = signToken(user.id);
    res.json({
      jwt_token: token,
      user: { id: user.id, email: user.email, company_name: user.company_name, plan: user.plan },
    });
  })
);

router.post('/logout', requireAuth, (_req, res) => {
  // Stateless JWTs: client discards the token. A blacklist (e.g. Redis set
  // keyed by token jti) can be added here if immediate revocation is needed.
  res.json({ success: true });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, company_name, plan, created_at')
      .eq('id', req.userId)
      .single();
    if (error || !user) throw new ApiError(404, 'User not found');
    res.json(user);
  })
);

const updateMeSchema = z.object({
  company_name: z.string().min(1),
});

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const updates = updateMeSchema.parse(req.body);
    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.userId)
      .select('id, email, company_name, plan, created_at')
      .single();
    if (error || !user) throw new ApiError(500, error?.message ?? 'Failed to update user');
    res.json(user);
  })
);

export default router;
