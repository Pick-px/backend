// src/socket/socket.manager.ts
import { Server } from 'socket.io';

let io: Server | null = null;
let resolveInit: (() => void) | null = null;

const readyPromise = new Promise<void>((resolve) => {
  resolveInit = resolve;
});

export function setSocketServer(server: Server) {
  io = server;
  resolveInit?.();
}

export async function waitForSocketServer(): Promise<Server> {
  if (io) return io;
  await readyPromise;
  return io!;
}

export function getSocketServer(): Server {
  if (!io) throw new Error('Socket server not initialized');
  return io;
}
