import { z } from 'zod';

const roleEnum = z.enum(['SUPER_ADMIN', 'ADMIN', 'ANALYSTE_SIG', 'CLIENT']);

const emailSchema = z
  .string()
  .email('Email invalide')
  .transform((v) => v.toLowerCase().trim());

export const createUserSchema = z.object({
  firstName: z.string().min(1, 'Le prénom est requis').max(100),
  lastName: z.string().min(1, 'Le nom est requis').max(100),
  email: emailSchema,
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').max(128),
  role: roleEnum.optional(),
  organizationId: z.string().uuid('Organisation invalide').nullable().optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: emailSchema.optional(),
  role: roleEnum.optional(),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "L'ancien mot de passe est requis"),
  newPassword: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(128)
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: roleEnum.optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().optional(),
});

export const userIdParamsSchema = z.object({
  id: z.string().uuid('Identifiant utilisateur invalide'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
