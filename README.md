# ft_transcendence_42


This is the last common core 42 school project

Made by :
    
    + Judith +
      Yulin

Goal

Build a real-time multiplayer online Pong game.

Main Objectives

    + Build a responsive frontend +

    Develop a RESTful API and WebSocket server

    Store data with a relational database 

    Use Docker to containerize the full app

    Implement user authentication, including OAuth2 (42 login) and 2FA

    + Create matchmaking and real-time gameplay +

    Enable user profiles, friend system, chat, and game history

    Ensure full HTTPS support and compatibility with Firefox

    Host the application using Docker Compose

Key Features to Implement

    Login system

    + Pong game +

    Persistent user data (profile, score, wins/losses, etc.)

    Friends list and direct messaging

    Chat system

    + Matchmaking system +

    Game history and leaderboards

    Custom avatars, themes, or game skins

    + AI opponents +

    Mobile responsiveness


Weekly planning for the team:


    1	+ Build Pong + tournament logic +

        * Setup Fastify base *

        - Setup SPA routing, UI skeleton -

    2	+ Add tournament matchmaking +

        * DB schema, REST API, bcrypt *

        - Forms + connect to API -

    3	+ AI opponent base +

        * JWT + 2FA auth, secure routes *

        - Auth UI, profile, dashboard -

    4	+ WebSocket: Remote Players and websync +

        * WS server for games + chat *

        - WS client, game + chat interface -

    5  	+ Move Pong logic server-side +

        * Game state API + CLI extension *

        - Refactor frontend to use API -

    6	+ Polish UX, mobile fixes +

        * Cleanup, final testing *

        - Polish UI, fix edge cases -


Modules

- [x] Remote Players (Major)
- [x] AI Opponent (Major)
- [x] Fastify Backend (Major)
- [x] Standard User Management (Major)
- [x] 2FA + JWT (Major)
- [x] Live Chat (Major)
- [x] Server-Side Pong + API (Major)
- [x] User and game stats dashboards (Minor)