/**
 * GOOD: Proper IDOR protection patterns
 * These patterns should NOT be flagged by idor-patterns rules.
 */

import { Request, Response } from 'express';

// Mock models with proper types
interface AuthenticatedRequest extends Request {
  user: { id: string; organizationId: string };
}

const Document: {
  findOne: (query: unknown) => Promise<unknown>;
  findUnique: (query: unknown) => Promise<unknown>;
} = {} as never;

const Post: {
  findOne: (query: unknown) => Promise<unknown>;
} = {} as never;

const prisma = {
  post: {
    update: (query: unknown) => Promise.resolve(query),
    delete: (query: unknown) => Promise.resolve(query),
    findUnique: (query: unknown) => Promise.resolve(query),
  },
  document: {
    findUnique: (query: unknown) => Promise.resolve(query),
  },
};

// GOOD: Include userId in query for ownership check
// ok: hawky.security.idor-params-no-ownership
export const getDocument = (req: AuthenticatedRequest, res: Response) => {
  const doc = Document.findOne({
    where: {
      id: req.params.id,
      userId: req.user.id,
    },
  });
  res.json(doc);
};

// ok: hawky.security.idor-params-no-ownership
export const getDocumentPrisma = (req: AuthenticatedRequest, res: Response) => {
  const doc = Document.findUnique({
    where: {
      id: req.params.id,
      userId: req.user.id,
    },
  });
  res.json(doc);
};

// GOOD: Using user_id (snake_case) for ownership
// ok: hawky.security.idor-params-no-ownership
export const getPost = (req: AuthenticatedRequest, res: Response) => {
  const post = Post.findOne({
    where: {
      id: req.params.id,
      user_id: req.user.id,
    },
  });
  res.json(post);
};

// GOOD: Using ownerId for ownership
// ok: hawky.security.idor-params-no-ownership
export const getOwnedResource = (req: AuthenticatedRequest, res: Response) => {
  const resource = Document.findOne({
    where: {
      id: req.params.id,
      ownerId: req.user.id,
    },
  });
  res.json(resource);
};

// GOOD: Proper update with ownership check
// ok: hawky.security.idor-update-no-ownership
export const updateDocument = (req: AuthenticatedRequest, res: Response) => {
  // First verify ownership
  const doc = prisma.document.findUnique({
    where: {
      id: req.params.id,
      userId: req.user.id,
    },
  });

  if (!doc) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Then update
  const updated = prisma.post.update({
    where: {
      id: req.params.id,
      userId: req.user.id,
    },
    data: req.body,
  });

  res.json(updated);
};

// GOOD: Organization-scoped access (multi-tenant)
// ok: hawky.security.idor-params-no-ownership
export const getOrgDocument = (req: AuthenticatedRequest, res: Response) => {
  const doc = Document.findOne({
    where: {
      id: req.params.id,
      organizationId: req.user.organizationId,
    },
  });
  res.json(doc);
};

// GOOD: Explicit ownership verification before operation
export const deleteWithVerification = (req: AuthenticatedRequest, res: Response) => {
  // First check ownership
  const canDelete = verifyOwnership(req.params.id, req.user.id);

  if (!canDelete) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Ownership verified, now delete
  prisma.post.delete({
    where: { id: req.params.id },
  });

  res.json({ deleted: true });
};

// Helper function for ownership verification
function verifyOwnership(_resourceId: string, _userId: string): boolean {
  // Implementation would check database
  return true;
}
