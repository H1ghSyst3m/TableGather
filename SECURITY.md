# Security Policy

## Supported Scope

TableGather Hub uses an in-memory room server for local table play. Rooms expire after 48 hours of inactivity, and rooms, host tokens, player tokens, and stage tokens are not durable and are lost when the server process restarts.

Security-sensitive areas include:

- room host, player, and stage token handling;
- WebSocket room commands and snapshots;
- player privacy in role-filtered snapshots;
- public Stage mode data exposure;
- local browser storage of reconnect tokens;
- Hub Session tab validation and stale-token cleanup.

## Reporting A Vulnerability

Please do not open a public issue for a suspected vulnerability.

Use the repository's private vulnerability reporting feature when available. If private reporting is not enabled, contact the repository maintainer through the repository owner profile and include:

- a short description of the issue;
- affected route, message, command, or snapshot type;
- steps to reproduce;
- expected private data boundaries;
- any proof of concept that avoids exposing real player data.

The maintainer will review valid reports before details are discussed publicly.
