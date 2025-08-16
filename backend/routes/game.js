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
          `INSERT INTO game_rooms (host_id, status) VALUES (?, 'pending')`,
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

    // ---- COUNTER ----
}
