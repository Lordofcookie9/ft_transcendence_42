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

    //Match history for private game
    fastify.post('/api/game/room/:id/join', { preValidation: [fastify.authenticate] }, async (request, reply) => {
      try {
        const roomId = Number(request.params.id);
        const me = request.user.id;

        const room = await fastify.db.get(`
          SELECT gr.*, hu.display_name AS host_alias, gu.display_name AS guest_alias
          FROM game_rooms gr
          JOIN users hu ON hu.id = gr.host_id
          LEFT JOIN users gu ON gu.id = gr.guest_id
          WHERE gr.id = ?
        `, [roomId]);

        if (!room) return reply.code(404).send({ error: 'Room not found' });

        if (room.host_id === me) {
          if (room.status === 'pending') {
            await fastify.db.run(`UPDATE game_rooms SET status = 'active' WHERE id = ?`, [roomId]);
          }
          return reply.send({
            ok: true, role: 'left', room_id: roomId,
            host_alias: room.host_alias, guest_alias: room.guest_alias || null
          });
        }

        if (room.guest_id && room.guest_id !== me) {
          return reply.code(409).send({ error: 'Room already has a guest' });
        }

        if (!room.guest_id) {
          await fastify.db.run(`UPDATE game_rooms SET guest_id = ?, status = 'active' WHERE id = ?`, [me, roomId]);
        }

        const meAliasRow = await fastify.db.get(`SELECT display_name FROM users WHERE id = ?`, [me]);
        return reply.send({
          ok: true, role: 'right', room_id: roomId,
          host_alias: room.host_alias,
          guest_alias: meAliasRow?.display_name || room.guest_alias || null
        });
      } catch (err) {
        request.log.error({ err }, 'Failed to join room');
        return reply.code(500).send({ error: 'Failed to join match' });
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

