import { AuditLog } from '../models/Sus.js';

export async function audit(req, action, targetType, targetId, meta) {
  try {
    await AuditLog.create({ actorId: req.user?._id, action, targetType, targetId: targetId && String(targetId), ip: req.ip, meta });
  } catch (err) {
    console.error('Audit log failed', err.message);
  }
}
