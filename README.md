# CastOff

CastOff is a real-time, browser-based dueling game. Two players connect over video, then cast spells using hand gestures tracked live through their webcams. No controllers, no keyboard, just your hand.

## How it works

Players join a private room and connect over WebRTC for live video and audio. Once a room is created, host can copy and send the URL to joiner. Each browser runs MediaPipe's hand landmark model locally to read gestures from that player's own camera feed. Detected actions are sent to the other player over a WebSocket connection, so both players see spells cast and damage applied in real time.

## Abilities

- **Fireball**: point your index finger up and hold for 3 seconds. Deals 20 damage unless blocked.
- **Shield**: hold your palm flat toward the camera. Blocks fireball damage while active.
- **Crush**: make a fist and hold for 3 seconds. Deals 5 damage, or breaks an active shield and locks it out for 6 seconds if the target is shielded.

## Features

- Full auth loop with hashed passwords
- Peer to peer video and audio via WebRTC, signaled through a WebSocket server
- Real time hand gesture detection using MediaPipe Tasks Vision, running entirely in the browser
- HP system with shield blocking and a shield break mechanic
- Basic CSS animations during casting
- Host controlled match start with a synced countdown
- Automatic win detection and a two player rematch vote
- Elo based leaderboard tracking wins and losses
- Graceful handling of a player leaving mid match or before a match starts

## Tech stack

**Frontend**: React, TypeScript, Vite, MediaPipe Tasks Vision, WebRTC, native WebSocket

**Backend**: FastAPI, PostgreSQL, raw SQL via psycopg2, session based authentication

**Hosting**: Vercel (frontend), Railway (backend and database)

## Why I built this

Inspired by Omoggle, I wanted to create some sort of online browser video battler. I opted for computer vision as I found it interesting. Along the way I worked through WebRTC signaling and keeping two independent gesture detection states in sync over a network through the sending of websockets.
