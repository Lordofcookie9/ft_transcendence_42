// Game routes extracted from server.js
module.exports = function registerGameRoutes(fastify) {
    fastify.post('/api/game/invite', { preValidation: [fastify.authenticate] }, async (request, reply) => {
      try {
        const { recipient_id } = request.body || {};
        if (!recipient_id) return reply.code(400).send({ error: 'recipient_id is required' });
        if (recipient_id === request.user.id) return reply.code(400).send({ error: 'Cannot invite yourself' });

        const rec = await fastify.db.get(`SELECT id FROM users WHERE id = ?`, [recipient_id]);
        if (!rec) return reply.code(404).send({ error: 'Recipient not found' });

        const ins = await fastify.db.run(
          `INSERT INTO game_rooms (host_id, status, mode) VALUES (?, 'pending', 'private_1v1')`,
          [request.user.id]
        );
        const roomId = ins.lastID;

        await fastify.db.run(
          `INSERT INTO private_messages (sender_id, recipient_id, message)
           VALUES (?, ?, ?)`,
          [request.user.id, recipient_id, `<(invite):${roomId}>`]
        );

        return reply.send({ room_id: roomId });
      } catch (err) {
        request.log.error({ err }, 'Failed to create game invite');
        return reply.code(500).send({ error: 'Failed to create invite' });
      }
    });

    // Join a room; assign role; return role + aliases (prefers tournament aliases when applicable)
    fastify.post('/api/game/room/:id/join', { preValidation: [fastify.authenticate] }, async (req, reply) => {
      try {
        const roomId = Number(req.params.id);
        const me = req.user.id;

        const room = await fastify.db.get(
          `SELECT id, host_id, guest_id, status, mode
            FROM game_rooms
            WHERE id = ?`,
          [roomId]
        );
        if (!room) return reply.code(404).send({ error: 'room_not_found' });
        // If this room belongs to a tournament, and that tournament is cancelled, block joining.
        try {
          const stat = await fastify.db.get(
            `SELECT tl.status AS lobby_status
               FROM tournament_matches tm
               JOIN tournament_lobbies tl ON tl.id = tm.lobby_id
              WHERE tm.room_id = ?
              LIMIT 1`, [roomId]
          );
          if (stat && String(stat.lobby_status) === 'cancelled') {
            return reply.code(410).send({ error: 'tournament_cancelled' });
          }
        } catch (e) { req.log && req.log.error && req.log.error({ e, roomId }, 'tournament_status_check_failed'); }


        // Attach user to room if needed (for private rooms or if a tournament room wasn't fully wired yet)
        if (!room.host_id) {
          // Non-tournament (private invite) path: first joiner becomes host
          await fastify.db.run(`UPDATE game_rooms SET host_id = ? WHERE id = ?`, [me, roomId]);
          room.host_id = me;
        } else if (!room.guest_id && Number(room.host_id) !== Number(me)) {
          await fastify.db.run(`UPDATE game_rooms SET guest_id = ? WHERE id = ?`, [me, roomId]);
          room.guest_id = me;
        }

        // My role (engine expects left/right)
        // When both players are set, mark the tournament match as 'active' so disconnects cancel properly
        try {
          if (room.host_id && room.guest_id) {
            const trow = await fastify.db.get(
              `SELECT id, status FROM tournament_matches WHERE room_id = ?`,
              [roomId]
            );
            if (trow && trow.status === 'pending') {
              await fastify.db.run(
                `UPDATE tournament_matches SET status = 'active' WHERE id = ?`,
                [trow.id]
              );
            
// Bump lobby activity when a match actually starts
try {
  const lidRow = await fastify.db.get(`SELECT lobby_id FROM tournament_matches WHERE id = ?`, [trow.id]);
  if (lidRow && lidRow.lobby_id) {
    await fastify.db.run(`UPDATE tournament_lobbies SET last_activity_at=CURRENT_TIMESTAMP WHERE id = ?`, [lidRow.lobby_id]);
  }
} catch (e) { req.log && req.log.error && req.log.error({ e }, 'bump_last_activity_failed'); }
}
          }
        } catch (e) {
          fastify.log.error({ err: e, roomId }, 'failed to mark tournament match active');
        }
        let role = 'spectator';
        if (Number(room.host_id) === Number(me)) role = 'left';
        else if (Number(room.guest_id) === Number(me)) role = 'right';

        // Defaults: display names
        const hostNameRow = room.host_id ? await fastify.db.get(
          `SELECT display_name FROM users WHERE id = ?`, [room.host_id]
        ) : null;
        const guestNameRow = room.guest_id ? await fastify.db.get(
          `SELECT display_name FROM users WHERE id = ?`, [room.guest_id]
        ) : null;

        let host_alias = hostNameRow?.display_name || 'Player';
        let guest_alias = guestNameRow?.display_name || '— waiting —';

        // If this is a tournament match room, prefer the tournament aliases
        const trow = await fastify.db.get(
          `SELECT tm.lobby_id, tm.p1_user_id, tm.p2_user_id,
                  tp1.alias AS p1_alias, tp2.alias AS p2_alias
            FROM tournament_matches tm
        LEFT JOIN tournament_participants tp1
              ON tp1.lobby_id = tm.lobby_id AND tp1.user_id = tm.p1_user_id
        LEFT JOIN tournament_participants tp2
              ON tp2.lobby_id = tm.lobby_id AND tp2.user_id = tm.p2_user_id
            WHERE tm.room_id = ?
            LIMIT 1`,
          [roomId]
        );

        if (trow) {
          // Map aliases onto the actual room sides
          if (room.host_id) {
            if (Number(room.host_id) === Number(trow.p1_user_id)) host_alias = trow.p1_alias || host_alias;
            else if (Number(room.host_id) === Number(trow.p2_user_id)) host_alias = trow.p2_alias || host_alias;
          }
          if (room.guest_id) {
            if (Number(room.guest_id) === Number(trow.p1_user_id)) guest_alias = trow.p1_alias || guest_alias;
            else if (Number(room.guest_id) === Number(trow.p2_user_id)) guest_alias = trow.p2_alias || guest_alias;
          }
        }

        return reply.send({
          ok: true,
          role,
          host_alias,
          guest_alias,
          room: { id: room.id, status: room.status, mode: room.mode }
        });
      } catch (err) {
        req.log?.error({ err }, 'room_join_failed');
        return reply.code(500).send({ error: 'internal_error' });
      }
    });

    fastify.get('/api/game/room/:id', async (request, reply) => {
      try {
        const roomId = Number(request.params.id);
        if (!roomId || Number.isNaN(roomId)) {
          return reply.code(400).send({ error: 'invalid_room_id' });
        }
        const row = await fastify.db.get(`
          SELECT gr.id, gr.host_id, gr.guest_id, gr.status, gr.mode,
                hu.display_name AS host_alias,
                gu.display_name AS guest_alias
          FROM game_rooms gr
          JOIN users hu ON hu.id = gr.host_id
          LEFT JOIN users gu ON gu.id = gr.guest_id
          WHERE gr.id = ?
        `, [roomId]);
        if (!row) return reply.code(404).send({ error: 'room_not_found' });
        const hasHost = !!row.host_id;
        const hasGuest = !!row.guest_id;
        return reply.send({
          ok: true,
          room_id: row.id,
          status: row.status,
          mode: row.mode,
          has_host: hasHost,
          has_guest: hasGuest,
          host_alias: row.host_alias || null,
          guest_alias: row.guest_alias || null,
          joinable: row.mode === 'private_1v1' && !hasGuest
        });
      } catch (err) {
        request.log?.error?.({ err }, 'Failed to fetch room status');
        return reply.code(500).send({ error: 'failed_to_fetch_room' });
      }
    });
    fastify.post('/api/game/result', { preValidation: [fastify.authenticate] }, async (request, reply) => {
      try {
        const { room_id, i_won, host_score: hs, guest_score: gs } = request.body || {};
        const me = request.user.id;

        if (!room_id || typeof i_won !== 'boolean') {
          return reply.code(400).send({ error: 'room_id and i_won are required' });
        }

        const room = await fastify.db.get(
          `SELECT id, host_id, guest_id, status, mode FROM game_rooms WHERE id = ?`,
          [room_id]
        );
        if (!room) return reply.code(404).send({ error: 'room_not_found' });
        // If this room belongs to a tournament, and that tournament is cancelled, block joining.
        try {
          const stat = await fastify.db.get(
            `SELECT tl.status AS lobby_status
               FROM tournament_matches tm
               JOIN tournament_lobbies tl ON tl.id = tm.lobby_id
              WHERE tm.room_id = ?
              LIMIT 1`, [roomId]
          );
          if (stat && String(stat.lobby_status) === 'cancelled') {
            return reply.code(410).send({ error: 'tournament_cancelled' });
          }
        } catch (e) { req.log && req.log.error && req.log.error({ e, roomId }, 'tournament_status_check_failed'); }

        if (room.mode !== 'private_1v1') return reply.send({ ok: true, ignored: 'not_private_1v1' });
        if (room.host_id !== me && room.guest_id !== me) {
          return reply.code(403).send({ error: 'not_in_room' });
        }
        if (!room.guest_id) return reply.code(400).send({ error: 'no_guest' });

        const winner_id = i_won ? me : (room.host_id === me ? room.guest_id : room.host_id);
        const loser_id  = i_won ? (room.host_id === me ? room.guest_id : room.host_id) : me;

        // Finish exactly once to avoid double-counting if both players post
        await fastify.db.run('BEGIN');
        const upd = await fastify.db.run(
          `UPDATE game_rooms SET status='finished' WHERE id=? AND status!='finished'`,
          [room_id]
        );

        if (upd.changes > 0) {
          await fastify.db.run(`UPDATE users SET pvp_wins = pvp_wins + 1   WHERE id = ?`, [winner_id]);
          await fastify.db.run(`UPDATE users SET pvp_losses = pvp_losses + 1 WHERE id = ?`, [loser_id]);
          const host_score  = Number.isFinite(+hs) ? +hs : null;
          const guest_score = Number.isFinite(+gs) ? +gs : null;
          await fastify.db.run(
            `INSERT INTO matches
              (room_id, mode, host_id, guest_id, winner_id, loser_id, host_score, guest_score, finished_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [room_id, room.mode, room.host_id, room.guest_id, winner_id, loser_id, host_score, guest_score]
          );
        }
        await fastify.db.run('COMMIT');

        return reply.send({ ok: true, updated: upd.changes > 0 });
      } catch (err) {
        try { await fastify.db.run('ROLLBACK'); } catch {}
        request.log.error({ err }, 'Failed to record result');
        return reply.code(500).send({ error: 'result_failed' });
      }
    });
}

