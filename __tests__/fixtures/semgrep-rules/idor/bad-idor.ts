/**
 * BAD: IDOR (Insecure Direct Object Reference) patterns
 * These patterns should be flagged by idor-patterns rules.
 *
 * NOTE: This is a test fixture for Semgrep rules. The code intentionally
 * demonstrates insecure patterns that should be detected.
 */

import { Request, Response } from 'express';

// Mock models
const User: {
  findById: (id: string) => Promise<unknown>;
  findByPk: (id: string) => Promise<unknown>;
  findByIdAndUpdate: (id: string, data: unknown) => Promise<unknown>;
  findByIdAndDelete: (id: string) => Promise<unknown>;
} = {} as never;

const Document: {
  findById: (id: string) => Promise<unknown>;
  findOne: (query: unknown) => Promise<unknown>;
  findUnique: (query: unknown) => Promise<unknown>;
} = {} as never;

const prisma = {
  post: {
    update: (query: unknown) => Promise.resolve(query),
    delete: (query: unknown) => Promise.resolve(query),
  },
};

// BAD: Direct lookup by req.params.id without ownership check
// ruleid: hawky.security.idor-params-no-ownership
export const getUser = (req: Request, res: Response) => {
  const user = User.findById(req.params.id);
  res.json(user);
};

// ruleid: hawky.security.idor-params-no-ownership
export const getDocument = (req: Request, res: Response) => {
  const doc = Document.findByPk(req.params.documentId);
  res.json(doc);
};

// ruleid: hawky.security.idor-params-no-ownership
export const findDoc = (req: Request, res: Response) => {
  const doc = Document.findOne({ where: { id: req.params.id } });
  res.json(doc);
};

// ruleid: hawky.security.idor-params-no-ownership
export const findDocPrisma = (req: Request, res: Response) => {
  const doc = Document.findUnique({ where: { id: req.params.id } });
  res.json(doc);
};

// BAD: Update/Delete without ownership
// ruleid: hawky.security.idor-update-no-ownership
export const updateUser = (req: Request, res: Response) => {
  const user = User.findByIdAndUpdate(req.params.id, req.body);
  res.json(user);
};

// ruleid: hawky.security.idor-update-no-ownership
export const deleteUser = (req: Request, res: Response) => {
  User.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
};

// ruleid: hawky.security.idor-update-no-ownership
export const updatePostPrisma = (req: Request, res: Response) => {
  const post = prisma.post.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(post);
};

// ruleid: hawky.security.idor-update-no-ownership
export const deletePostPrisma = (req: Request, res: Response) => {
  prisma.post.delete({
    where: { id: req.params.id },
  });
  res.json({ deleted: true });
};
