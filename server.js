const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const logFile = path.join(__dirname, 'debug.log');

function logToFile(msg) {
    const timestamp = new Date().toISOString();
    try {
        fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
    } catch (e) {
        console.error('Logging failed:', e);
    }
    console.log(`[${timestamp}] ${msg}`);
}


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Раздача статики (клиента) из текущей директории
app.use(express.static(__dirname));

// Хранилище комнат
// Хранилище комнат
// rooms[roomId] = { hostId: string, guestId: string, hostColor: 'w' | 'b', hostName: string, guestName: string }
const rooms = {};

io.on('connection', (socket) => {
    logToFile(`User connected: ${socket.id}`);

    // Создание комнаты
    socket.on('create_room', (data) => {
        // data = { color: 'w' | 'b' | 'random', nickname: string }
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 случайных символов

        let hostColor = data.color;
        if (hostColor === 'random') {
            hostColor = Math.random() > 0.5 ? 'w' : 'b';
        }

        rooms[roomId] = {
            hostId: socket.id,
            guestId: null,
            hostColor: hostColor,
            hostName: data.nickname || 'Гость'
        };

        socket.join(roomId);
        socket.emit('room_created', { roomId, color: hostColor });
        console.log(`Room ${roomId} created by ${socket.id} (Color: ${hostColor}, Name: ${data.nickname})`);
    });

    // Подключение к комнате
    socket.on('join_room', (data) => {
        // Поддержка старого и нового формата: (roomId) или ({ roomId, nickname })
        let roomId = '';
        let nickname = 'Гость';

        if (typeof data === 'string') {
            roomId = data.toUpperCase();
        } else {
            roomId = (data.roomId || '').toUpperCase();
            nickname = data.nickname || 'Гость';
        }

        const room = rooms[roomId];

        if (!room) {
            socket.emit('error_message', 'Комната не найдена.');
            return;
        }

        if (room.guestId) {
            socket.emit('error_message', 'Комната уже заполнена.');
            return;
        }

        room.guestId = socket.id;
        room.guestName = nickname;
        socket.join(roomId);

        const guestColor = room.hostColor === 'w' ? 'b' : 'w';

        // Уведомляем гостя (и передаем имя хоста)
        socket.emit('room_joined', { roomId, color: guestColor, opponentName: room.hostName });

        // Уведомляем обоих о начале игры
        io.to(roomId).emit('game_started', {
            hostName: room.hostName,
            guestName: room.guestName,
            hostColor: room.hostColor
        });
        console.log(`${socket.id} joined room ${roomId}`);
    });

    // Передача хода
    socket.on('make_move', (data) => {
        // data: { roomId, move }
        socket.to(data.roomId).emit('opponent_move', data.move);
    });

    socket.on('use_ability', (data) => {
        // data: { roomId, type, square, ... }
        socket.to(data.roomId).emit('opponent_ability', data);
    });

    // Система отмены хода
    socket.on('request_undo', (roomId) => {
        socket.to(roomId).emit('undo_requested');
    });

    socket.on('accept_undo', (roomId) => {
        socket.to(roomId).emit('undo_accepted');
    });

    socket.on('reject_undo', (roomId) => {
        socket.to(roomId).emit('undo_rejected');
    });

    socket.on('log', (msg) => {
        logToFile(`[CLIENT ${socket.id}] ${msg}`);
    });

    // Отключение
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Поиск комнаты, где этот юзер был
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.hostId === socket.id || room.guestId === socket.id) {
                // Если кто-то отключился, уведомляем второго игрока
                socket.to(roomId).emit('opponent_disconnected');
                delete rooms[roomId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
