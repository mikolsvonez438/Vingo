const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    transports: ['polling'],
    cors: {
        origin: '*'
    }
});
// Serve static files from public directory
//
app.use(express.static('public'));
const gameRooms = new Map(); // Room Code -> Room State

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function createNewRoom() {
    return {
        host: null,
        players: new Map(), // Socket ID -> Player Name
        drawnNumbers: new Set(),
        availableNumbers: new Set(),
        gameActive: false,
        playerCards: new Map() // Socket ID -> Bingo Card
    };
}

// Game state
let gameState = {
    host: null,
    players: new Map(), // Socket ID -> Player Name
    drawnNumbers: new Set(),
    availableNumbers: new Set(),  // Add this to track available numbers
    gameActive: false,
    playerCards: new Map() // Socket ID -> Bingo Card

};
// Initialize available numbers (1-75)
function initializeAvailableNumbers(roomCode) {
    const room = gameRooms.get(roomCode);
    room.availableNumbers.clear();
    for (let i = 1; i <= 75; i++) {
        room.availableNumbers.add(i);
    }
}
// Get random number that hasn't been drawn yet
function getRandomNumber(roomCode) {
    const room = gameRooms.get(roomCode);
    const availableNums = Array.from(room.availableNumbers);
    if (availableNums.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * availableNums.length);
    const number = availableNums[randomIndex];

    room.availableNumbers.delete(number);
    room.drawnNumbers.add(number);

    return number;

}

// In your server code


// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    socket.on('chat_message', (data) => {
        io.to(data.room).emit('chat_message', {
            message: data.message,
            sender: data.sender
        });
    });
    
    // Handle create room request
    socket.on('createRoom', (playerName) => {
        const roomCode = generateRoomCode();
        gameRooms.set(roomCode, createNewRoom());

        const room = gameRooms.get(roomCode);
        room.host = socket.id;
        room.players.set(socket.id, playerName);

        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
        socket.emit('hostAssigned');
        
        io.to(roomCode).emit('updatePlayers', Array.from(room.players.values()));

        console.log(`Room ${roomCode} created by ${playerName}`);
    });

    // Handle join room request
    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const room = gameRooms.get(roomCode);

        if (!room) {
            socket.emit('errorMessage', 'Room does not exist');
            return;
        }

        socket.join(roomCode);
        room.players.set(socket.id, playerName);
        socket.emit('roomJoined', roomCode);
        
        const card = generateBingoCard();
        room.playerCards.set(socket.id, card);

        socket.emit('playerAssigned', card);
        io.to(roomCode).emit('updatePlayers', Array.from(room.players.values()));

        console.log(`${playerName} joined room ${roomCode}`);
    });

    // Handle number drawing (host only)
    socket.on('drawNumber', (roomCode) => {
        const room = gameRooms.get(roomCode);

        if (socket.id === room.host && room.gameActive) {
            const number = getRandomNumber(roomCode);

            if (number !== null) {
                io.to(roomCode).emit('numberDrawn', number);
            } else {
                io.to(roomCode).emit('gameMessage', 'All numbers have been drawn!');
            }
        }
    });

    // Handle game start (host only)
    socket.on('startGame', (roomCode) => {
        const room = gameRooms.get(roomCode);

        if (socket.id === room.host) {
            room.gameActive = true;
            room.drawnNumbers.clear();
            initializeAvailableNumbers(roomCode);
            io.to(roomCode).emit('gameStarted');
        }
    });

    // Handle game reset (host only)
    socket.on('resetGame', (roomCode) => {
        const room = gameRooms.get(roomCode);

        if (socket.id === room.host) {
            room.gameActive = false;
            room.drawnNumbers.clear();
            initializeAvailableNumbers(roomCode);
            io.to(roomCode).emit('gameReset');
        }
    });

    // Handle BINGO calls
    socket.on('bingoCalled', ({ room, playerName, card }) => {
        const gameRoom  = gameRooms.get(room);
        console.log(room)

        if (gameRoom .gameActive) {
            if (verifyWin(card, gameRoom .drawnNumbers)) {
                gameRoom .gameActive = false;
                io.to(room).emit('bingoWinner', playerName);
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        // Find which room the disconnected socket was in
        for (const [roomCode, room] of gameRooms.entries()) {
            if (room.players.has(socket.id)) {
                const playerName = room.players.get(socket.id);

                // If host disconnects, assign new host or delete room
                if (socket.id === room.host) {
                    const players = Array.from(room.players.keys());
                    const remainingPlayers = players.filter(id => id !== socket.id);

                    if (remainingPlayers.length > 0) {
                        room.host = remainingPlayers[0];
                        io.to(remainingPlayers[0]).emit('hostAssigned');
                    } else {
                        gameRooms.delete(roomCode);
                        return;
                    }
                }

                // Remove player from room
                room.players.delete(socket.id);
                room.playerCards.delete(socket.id);

                // Update remaining players
                io.to(roomCode).emit('updatePlayers', Array.from(room.players.values()));
                console.log(`${playerName} disconnected from room ${roomCode}`);

                // If room is empty, delete it
                if (room.players.size === 0) {
                    gameRooms.delete(roomCode);
                    console.log(`Room ${roomCode} deleted`);
                }

                break;
            }
        }
    });
});
function generateRandomNumbers(min, max, count) {
    const numbers = [];
    while (numbers.length < count) {
        const num = Math.floor(Math.random() * (max - min + 1)) + min;
        if (!numbers.includes(num)) {
            numbers.push(num);

        }
    }
    return numbers;
}
// Helper function to generate a bingo card
function generateBingoCard() {
    const card = [];
    // B (1-15)
    const b = generateRandomNumbers(1, 15, 5);
    // I (16-30)
    const i = generateRandomNumbers(16, 30, 5);
    // N (31-45)
    const n = generateRandomNumbers(31, 45, 5);
    // G (46-60)
    const g = generateRandomNumbers(46, 60, 5);
    // O (61-75)
    const o = generateRandomNumbers(61, 75, 5);
    n[2] = "FREE";
    // Combine all columns
    for (let row = 0; row < 5; row++) {
        card.push([
            b[row],
            i[row],
            n[row],
            g[row],
            o[row]
        ]);

    }
    return card;
}
// Helper function to verify win
function verifyWin(card, drawnNumbers) {
    const drawn = Array.from(drawnNumbers);

    // Helper function to check if a pattern matches
    const checkPattern = (coordinates) => {
        return coordinates.every(([row, col]) => drawn.includes(card[row][col]));
    };

    // Row patterns
    for (let i = 0; i < 5; i++) {
        if (card[i].every(num => drawn.includes(num))) return true;
    }

    // Column patterns
    for (let col = 0; col < 5; col++) {
        if (card.every(row => drawn.includes(row[col]))) return true;
    }

    // Diagonal patterns
    const diagonalPatterns = [
        [[0, 4], [1, 3], [3, 1], [4, 0]], // Top-right to bottom-left
        [[0, 0], [1, 1], [3, 3], [4, 4]], // Top-left to bottom-right
        [[0, 3], [1, 2], [2, 1], [3, 0]], // Partial diagonal
        [[1, 4], [2, 3], [3, 2], [4, 1]], // Partial diagonal
        [[0, 1], [1, 2], [2, 3], [3, 4]], // Partial diagonal
        [[0, 0], [1, 1], [2, 2], [3, 3]], // Partial diagonal
    ];

    for (let pattern of diagonalPatterns) {
        if (checkPattern(pattern)) return true;
    }

    // Box patterns (2x2)
    const boxPatterns = [
        [[0, 0], [0, 1], [1, 0], [1, 1]], // Top-left
        [[0, 1], [0, 2], [1, 1], [1, 2]], // Top-middle
        [[0, 2], [0, 3], [1, 2], [1, 3]], // Top-middle-right
        [[0, 3], [0, 4], [1, 3], [1, 4]], // Top-right
        [[1, 0], [1, 1], [2, 0], [2, 1]], // Middle-left
        [[1, 3], [1, 4], [2, 3], [2, 4]], // Middle-right
        [[2, 3], [2, 4], [3, 3], [3, 4]], // Bottom-middle-right
        [[2, 0], [2, 1], [3, 0], [3, 1]], // Bottom-middle-left
        [[3, 0], [3, 1], [4, 0], [4, 1]], // Bottom-left
        [[3, 1], [3, 2], [4, 1], [4, 2]], // Bottom-middle
        [[3, 2], [3, 3], [4, 2], [4, 3]], // Bottom-middle-right
        [[3, 3], [3, 4], [4, 3], [4, 4]]  // Bottom-right
    ];

    for (let pattern of boxPatterns) {
        if (checkPattern(pattern)) return true;
    }

    // Corner patterns
    if (checkPattern([[0, 0], [0, 4], [4, 0], [4, 4]])) return true;

    // Flower patterns
    const flowerPatterns = [
        [[0, 2], [2, 0], [2, 4], [4, 2]], // Cross pattern
        [[1, 2], [2, 1], [2, 3], [3, 2]], // Center flower
        [[0, 1], [1, 0], [1, 2], [2, 1]], // Top flower
        [[0, 3], [1, 2], [1, 4], [2, 3]], // Top-right flower
        [[2, 1], [3, 0], [3, 2], [4, 1]], // Bottom-left flower
        [[2, 3], [3, 2], [3, 4], [4, 3]]  // Bottom-right flower
    ];

    for (let pattern of flowerPatterns) {
        if (checkPattern(pattern)) return true;
    }
    console.log("pattern ko dito ang tinatawag")
    return false;
}
// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
