import { Router } from 'express';
import { consumeTicket, issueTicket, registerClient, unregisterClient } from '../events/eventBus';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';

const router = Router();

router.post(
  '/ticket',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ticket = await issueTicket(req.userId!);
    res.json({ ticket });
  })
);

router.get(
  '/stream',
  asyncHandler(async (req, res) => {
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : undefined;
    if (!ticket) throw new ApiError(400, 'Missing ticket');

    const userId = await consumeTicket(ticket);
    if (!userId) throw new ApiError(401, 'Invalid or expired ticket');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');

    registerClient(userId, res);

    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unregisterClient(userId, res);
    });
  })
);

export default router;
