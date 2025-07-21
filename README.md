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


1   
    + Build Pong + tournament logic +            (Mandatory Part)

    * Setup Fastify base *                       (Framework Module - Major)

    - Setup SPA routing, UI skeleton -           (Frontend Setup / Tailwind - Minor if applicable)


2   
    + Add tournament matchmaking +               (Mandatory Part)

    * DB schema, REST API, bcrypt *              (Standard User Management - Major)

    - Forms + connect to API -                   (Standard User Management - Major)


3   
    + AI opponent base +                         (AI Opponent - Major)

    * JWT + 2FA auth, secure routes *            (2FA + JWT - Major)

    - Auth UI, profile, dashboard -              (Standard User Management - Major)


4   
    + WebSocket: Remote Players and websync +    (Remote Players - Major)

    * WS server for games + chat *               (Remote Players + Live Chat - Major)

    - WS client, game + chat interface -         (Remote Players + Live Chat - Major)


5   
    + Move Pong logic server-side +              (Server-Side Pong + API - Major)

    * Game state API + CLI extension *           (Server-Side Pong + API - Major)

    - Refactor frontend to use API -             (Server-Side Pong - Major)


6   
    + Polish UX, mobile fixes +                  (Accessibility: Support on all devices - Minor)

    * Cleanup, final testing *                   (General / Mandatory polish)

    - Polish UI, fix edge cases -                (Accessibility + UX improvements)



Modules

- [x] Remote Players (Major)
- [x] AI Opponent (Major)
- [x] Fastify Backend (Major)
- [x] Standard User Management (Major)
- [x] 2FA + JWT (Major)
- [x] Live Chat (Major)
- [x] Server-Side Pong + API (Major)
- [x] User and game stats dashboards (Minor)