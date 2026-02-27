// src/socket.js
import { Server } from "socket.io";

let io;

/**
 * Initialize Socket.IO
 */
export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // safe for mobile apps
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    /**
     * 🔥 NEW — Join a USER room (for Messages screen)
     */
    socket.on("joinUserRoom", (userId) => {
      if (!userId) return;
      socket.join(userId);
      console.log(`👤 Socket ${socket.id} joined user room ${userId}`);
    });

    /**
     * Join a conversation room (for ChatDetail screen)
     */
    socket.on("joinConversation", (conversationId) => {
      if (!conversationId) return;
      socket.join(conversationId);
      console.log(`💬 Socket ${socket.id} joined conversation ${conversationId}`);
    });

    /**
     * Disconnect
     */
    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected:", socket.id);
    });
  });

  return io;
};

/**
 * Get active socket instance anywhere in backend
 */
export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};