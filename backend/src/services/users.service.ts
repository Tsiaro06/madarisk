import { AppError } from '../utils/app-error';
import { password } from '../utils/password';
import { usersRepository } from '../repositories/users.repository';
import { SanitizedUser, UserRole, UsersListResult } from '../types/auth.types';
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from '../validators/users.validator';
import { IncomingHttpHeaders } from 'http';

interface RequestContext {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: IncomingHttpHeaders;
}

function getIp(req: RequestContext): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export const usersService = {
  async create(
    input: CreateUserInput,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<SanitizedUser> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seul un SUPER_ADMIN peut créer des utilisateurs');
    }

    const requestedRole = input.role ?? 'CLIENT';
    if (requestedRole === 'SUPER_ADMIN') {
      throw AppError.forbidden("La création d'un SUPER_ADMIN par un autre compte est interdite");
    }

    const existing = await usersRepository.findByEmail(input.email);
    if (existing) {
      throw AppError.conflict('Un compte avec cet email existe déjà');
    }

    const passwordHash = await password.hash(input.password);
    const user = await usersRepository.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: requestedRole,
      organizationId: input.organizationId,
    });

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: user.id,
      newValue: { email: user.email, role: user.role },
      ipAddress: getIp(req),
    });

    return usersRepository.sanitizeUser(user);
  },

  async list(query: ListUsersQuery): Promise<UsersListResult> {
    const { rows, total } = await usersRepository.list({
      page: query.page,
      limit: query.limit,
      role: query.role,
      isActive: query.isActive,
      search: query.search,
    });

    return {
      users: rows.map((u) => usersRepository.sanitizeUser(u)),
      page: query.page,
      limit: query.limit,
      total,
    };
  },

  async getById(id: string): Promise<SanitizedUser> {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw AppError.notFound('Utilisateur introuvable');
    }
    return usersRepository.sanitizeUser(user);
  },

  async update(
    id: string,
    input: UpdateUserInput,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<SanitizedUser> {
    const target = await usersRepository.findById(id);
    if (!target) {
      throw AppError.notFound('Utilisateur introuvable');
    }

    const isOwner = actor.id === id;
    const isSuperAdmin = actor.role === 'SUPER_ADMIN';

    if (!isOwner && !isSuperAdmin) {
      throw AppError.forbidden('Accès refusé');
    }

    const data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      role?: UserRole;
    } = {};

    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.email !== undefined) data.email = input.email;

    if (input.role !== undefined) {
      if (!isSuperAdmin) {
        throw AppError.forbidden('Seul un SUPER_ADMIN peut modifier le rôle');
      }
      if (target.role === 'SUPER_ADMIN' && input.role !== 'SUPER_ADMIN') {
        const remaining = await usersRepository.countActiveSuperAdmins(id);
        if (remaining < 1) {
          throw AppError.conflict('Impossible de retirer le rôle du dernier SUPER_ADMIN actif');
        }
      }
      data.role = input.role;
    }

    const updated = await usersRepository.update(id, data);
    if (!updated) {
      throw AppError.notFound('Utilisateur introuvable');
    }

    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      oldValue: {
        firstName: target.firstName,
        lastName: target.lastName,
        email: target.email,
        role: target.role,
      },
      newValue: data,
      ipAddress: getIp(req),
    });

    if (input.role !== undefined) {
      await usersRepository.writeAudit({
        userId: actor.id,
        action: 'USER_ROLE_CHANGED',
        entityType: 'user',
        entityId: id,
        oldValue: { role: target.role },
        newValue: { role: updated.role },
        ipAddress: getIp(req),
      });
    }

    return usersRepository.sanitizeUser(updated);
  },

  async updateStatus(
    id: string,
    isActive: boolean,
    actor: { id: string; role: UserRole },
    req: RequestContext,
  ): Promise<SanitizedUser> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Seul un SUPER_ADMIN peut activer ou désactiver un compte');
    }

    const target = await usersRepository.findById(id);
    if (!target) {
      throw AppError.notFound('Utilisateur introuvable');
    }

    if (isActive === false && target.role === 'SUPER_ADMIN') {
      const remaining = await usersRepository.countActiveSuperAdmins(id);
      if (remaining < 1) {
        throw AppError.conflict('Impossible de désactiver le dernier SUPER_ADMIN actif');
      }
    }

    const updated = await usersRepository.updateStatus(id, isActive);
    if (!updated) {
      throw AppError.notFound('Utilisateur introuvable');
    }

    await usersRepository.writeAudit({
      userId: actor.id,
      action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entityType: 'user',
      entityId: id,
      oldValue: { isActive: target.isActive },
      newValue: { isActive: updated.isActive },
      ipAddress: getIp(req),
    });

    return usersRepository.sanitizeUser(updated);
  },

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    req: RequestContext,
  ): Promise<void> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('Utilisateur introuvable');
    }

    const valid = await password.compare(oldPassword, user.passwordHash);
    if (!valid) {
      throw AppError.badRequest('Ancien mot de passe incorrect');
    }

    const newHash = await password.hash(newPassword);
    await usersRepository.updatePassword(userId, newHash);

    await usersRepository.writeAudit({
      userId,
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'user',
      entityId: userId,
      ipAddress: getIp(req),
    });
  },
};
