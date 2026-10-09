import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

export const emailSchema = z
  .string({ error: 'Enter your email.' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email.'));

export const passwordSchema = z
  .string({ error: 'Enter a password.' })
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(128);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'New password must differ from the current one.',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
