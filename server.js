const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
// Serve static files from public directory
app.use(express.static('public'));
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
function initializeAvailableNumbers() {
    gameState.availableNumbers.clear();
    for (let i = 1; i <= 75; i++) {
        gameState.availableNumbers.add(i);

    }
}
// Get random number that hasn't been drawn yet
function getRandomNumber() {
    const availableNums = Array.from(gameState.availableNumbers);
    if (availableNums.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * availableNums.length);
    const number = availableNums[randomIndex];

    // Remove the number from available numbers and add to drawn numbers
    gameState.availableNumbers.delete(number);
    gameState.drawnNumbers.add(number);

    return number;

}
// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    // Handle player joining
    socket.on('joinGame', (playerName) => {
        // Assign first player as host
        if (!gameState.host) {
            gameState.host = socket.id;
            gameState.players.set(socket.id, playerName);
            socket.emit('hostAssigned');
            console.log('Host assigned:', playerName);

        } else {
            // Add other players
            gameState.players.set(socket.id, playerName);
            const card = generateBingoCard();
            gameState.playerCards.set(socket.id, card);
            socket.emit('playerAssigned', card);
            console.log('Player joined:', playerName);

        }
        // Update all clients with new player list
        io.emit('updatePlayers', Array.from(gameState.players.values()));
    });
    // Handle number drawing (host only)
    socket.on('drawNumber', () => {
        console.log('Draw number requested by:', socket.id);
        console.log('Current host:', gameState.host);
        console.log('Game active:', gameState.gameActive);
        if (socket.id === gameState.host && gameState.gameActive) {
            const number = getRandomNumber();
            console.log('Number drawn:', number);

            if (number !== null) {
                io.emit('numberDrawn', number);
                console.log('Number drawn and emitted:', number);

            } else {
                io.emit('gameMessage', 'All numbers have been drawn!');

            }
        } else {
            console.log('Draw number rejected - not host or game not active');

        }
    });
    // Handle game start (host only)
    socket.on('startGame', () => {
        if (socket.id === gameState.host) {
            gameState.gameActive = true;
            gameState.drawnNumbers.clear();
            initializeAvailableNumbers();  // Initialize available numbers
            io.emit('gameStarted');
            console.log('Game started');

        }
    });
    // Handle game reset (host only)
    socket.on('resetGame', () => {
        if (socket.id === gameState.host) {
            gameState.gameActive = false;
            gameState.drawnNumbers.clear();
            initializeAvailableNumbers();  // Reset available numbers
            io.emit('gameReset');
            console.log('Game reset');

        }
    });
    // Handle BINGO calls
    socket.on('bingoCalled', ({ playerName, card }) => {
        if (gameState.gameActive) {
            if (verifyWin(card, gameState.drawnNumbers)) {
                gameState.gameActive = false;
                io.emit('bingoWinner', playerName);
                console.log('BINGO winner:', playerName);

            }
        }
    });
    // Handle disconnection
    socket.on('disconnect', () => {
        const playerName = gameState.players.get(socket.id);

        // If host disconnects, assign new host
        if (socket.id === gameState.host) {
            const players = Array.from(gameState.players.keys());
            const remainingPlayers = players.filter(id => id !== socket.id);

            if (remainingPlayers.length > 0) {
                gameState.host = remainingPlayers[0];
                io.to(gameState.host).emit('hostAssigned');

            } else {
                gameState.host = null;

            }
        }
        // Remove player from game state
        gameState.players.delete(socket.id);
        gameState.playerCards.delete(socket.id);
        // Update all clients
        io.emit('updatePlayers', Array.from(gameState.players.values()));
        console.log('User disconnected:', playerName);
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
        [[0,4], [1,3], [3,1], [4,0]], // Top-right to bottom-left
        [[0,0], [1,1], [3,3], [4,4]], // Top-left to bottom-right
        [[0,3], [1,2], [2,1], [3,0]], // Partial diagonal
        [[1,4], [2,3], [3,2], [4,1]], // Partial diagonal
        [[0,1], [1,2], [2,3], [3,4]], // Partial diagonal
        [[0,0], [1,1], [2,2], [3,3]], // Partial diagonal
    ];

    for (let pattern of diagonalPatterns) {
        if (checkPattern(pattern)) return true;
    }

    // Box patterns (2x2)
    const boxPatterns = [
        [[0,0], [0,1], [1,0], [1,1]], // Top-left
        [[0,1], [0,2], [1,1], [1,2]], // Top-middle
        [[0,2], [0,3], [1,2], [1,3]], // Top-middle-right
        [[0,3], [0,4], [1,3], [1,4]], // Top-right
        [[1,0], [1,1], [2,0], [2,1]], // Middle-left
        [[1,3], [1,4], [2,3], [2,4]], // Middle-right
        [[2,3], [2,4], [3,3], [3,4]], // Bottom-middle-right
        [[2,0], [2,1], [3,0], [3,1]], // Bottom-middle-left
        [[3,0], [3,1], [4,0], [4,1]], // Bottom-left
        [[3,1], [3,2], [4,1], [4,2]], // Bottom-middle
        [[3,2], [3,3], [4,2], [4,3]], // Bottom-middle-right
        [[3,3], [3,4], [4,3], [4,4]]  // Bottom-right
    ];

    for (let pattern of boxPatterns) {
        if (checkPattern(pattern)) return true;
    }

    // Corner patterns
    if (checkPattern([[0,0], [0,4], [4,0], [4,4]])) return true;

    // Flower patterns
    const flowerPatterns = [
        [[0,2], [2,0], [2,4], [4,2]], // Cross pattern
        [[1,2], [2,1], [2,3], [3,2]], // Center flower
        [[0,1], [1,0], [1,2], [2,1]], // Top flower
        [[0,3], [1,2], [1,4], [2,3]], // Top-right flower
        [[2,1], [3,0], [3,2], [4,1]], // Bottom-left flower
        [[2,3], [3,2], [3,4], [4,3]]  // Bottom-right flower
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


// // row and column pattern
// X X X X X
// · · · · ·
// · · · · ·
// · · · · ·
// · · · · ·

// · · · · ·
// X X X X X
// · · · · ·
// · · · · ·
// · · · · ·

// · · · · ·
// · · · · ·
// X X · X X
// · · · · ·
// · · · · ·

// · · · · ·
// · · · · ·
// · · · · ·
// X X X X X
// · · · · ·

// · · · · ·
// · · · · ·
// · · · · ·
// · · · · ·
// X X X X X

// X · · · ·
// X · · · ·
// X · · · ·
// X · · · ·
// X · · · ·

// · X · · ·
// · X · · ·
// · X · · ·
// · X · · ·
// · X · · ·

// · · X · ·
// · · X · ·
// · · · · ·
// · · X · ·
// · · X · ·

// · · · X ·
// · · · X ·
// · · · X ·
// · · · X ·
// · · · X ·

// · · · · X
// · · · · X
// · · · · X
// · · · · X
// · · · · X


// // diagonal pattern



// · · · · X
// · · · X ·
// · · · · ·
// · X · · ·
// X · · · ·

// X · · · ·
// · X · · ·
// · · · · ·
// · · · X ·
// · · · · X

// · · · X ·
// · · X · ·
// · X · · ·
// X · · · ·
// · · · · ·

// · · · · ·
// · · · · X
// · · · X ·
// · · X · ·
// · X · · ·

// · X · · ·
// · · X · ·
// · · · X ·
// · · · · X
// · · · · ·

// · · · · ·
// X · · · ·
// · X · · ·
// · · X · ·
// · · · X ·

// // box pattern

// X X · · ·
// X X · · ·
// · · · · ·
// · · · · ·
// · · · · ·


// · X X · ·
// · X X · ·
// · · · · ·
// · · · · ·
// · · · · ·


// · · X X ·
// · · X X ·
// · · · · ·
// · · · · ·
// · · · · ·


// · · · X X
// · · · X X
// · · · · ·
// · · · · ·
// · · · · ·

// · · · · ·
// X X · · ·
// X X · · ·
// · · · · ·
// · · · · ·

// · · · · ·
// · · · X X
// · · · X X
// · · · · ·
// · · · · ·

// · · · · ·
// · · · · ·
// · · · X X
// · · · X X
// · · · · ·

// · · · · ·
// · · · · ·
// X X · · ·
// X X · · ·
// · · · · ·

// · · · · ·
// · · · · ·
// · · · · ·
// X X · · ·
// X X · · ·


// · · · · ·
// · · · · ·
// · · · · ·
// · X X · ·
// · X X · ·

// · · · · ·
// · · · · ·
// · · · · ·
// · · X X ·
// · · X X ·



// · · · · ·
// · · · · ·
// · · · · ·
// · · · X X
// · · · X X

// X · · · X
// · · · · ·
// · · · · ·
// · · · · ·
// X · · · X

// · · · · ·
// · X · X ·
// · · · · ·
// · X · X ·
// · · · · ·

// // flower pattern

// · · X · ·
// · · · · ·
// X · · · X
// · · · · ·
// · · X · ·

// · · · · ·
// · · X · ·
// · X · X ·
// · · X · ·
// · · · · ·

// · X · · ·
// X · X · ·
// · X · · ·
// · · · · ·
// · · · · ·

// · · · X ·
// · · X · X
// · · · X ·
// · · · · ·
// · · · · ·

// · · · · ·
// · · · · ·
// · X · · ·
// X · X · ·
// · X · · ·


// · · · · ·
// · · · · ·
// · · · X ·
// · · X · X
// · · · X ·














// · · · · ·
// · · · · ·
// · · · · ·
// · · · · ·
// · · · · ·