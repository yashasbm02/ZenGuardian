import type { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { UserModel } from '../models/user.model';
import { JournalModel } from '../models/journal.model';
import { ChatMessageModel } from '../models/chatMessage.model';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

/** GET /api/user/export — download all entries as JSON (no embeddings). */
export async function exportData(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const user = await UserModel.findById(req.userId).lean();
    const entries = await JournalModel.find({ userId })
      .sort({ createdAt: 1 })
      .select('content moodMetrics redacted createdAt')
      .lean();
    const conversation = await ChatMessageModel.find({ userId })
      .sort({ createdAt: 1 })
      .select('role content createdAt')
      .lean();

    const payload = JSON.stringify(
      { exportedAt: new Date(), user: { email: user?.email }, entries, conversation },
      null,
      2,
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="zenguardian-export.json"');
    res.send(payload);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/user — atomic account wipe.
 * Deletes all journal entries first, then the user doc, then clears the
 * auth cookie. The session is dead whether or not the client receives the
 * response.
 */
export async function deleteAccount(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await mongoose.startSession();
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    await session.withTransaction(async () => {
      await JournalModel.deleteMany({ userId }, { session });
      await ChatMessageModel.deleteMany({ userId }, { session });
      await UserModel.findByIdAndDelete(req.userId, { session });
    });

    res.clearCookie('auth_token', { path: '/' });
    res.status(204).end();
  } catch (err) {
    next(err);
  } finally {
    await session.endSession();
  }
}
