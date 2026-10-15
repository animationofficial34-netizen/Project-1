const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let waitingUsers = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // यूज़र चैट ढूंढने का अनुरोध करता है
    socket.on('find-partner', (data) => {
        if (waitingUsers.length > 0) {
            let partnerSocket = waitingUsers.pop();
            
            // दोनों को आपस में रूम आईडी से जोड़ें
            let roomId = socket.id + '#' + partnerSocket.id;
            socket.join(roomId);
            partnerSocket.join(roomId);

            socket.emit('match-found', { partnerId: partnerSocket.id, initiate: true, roomId });
            partnerSocket.emit('match-found', { partnerId: socket.id, initiate: false, roomId });
        } else {
            waitingUsers.push(socket);
        }
    });

    // WebRTC Signaling Events
    socket.on('signal', (data) => {
        io.to(data.target).emit('signal', {
            sender: socket.id,
            signal: data.signal
        });
    });

    // Text Message Forwarding
    socket.on('send-message', (data) => {
        socket.to(data.roomId).emit('receive-message', data.message);
    });

    // User Disconnect
    socket.on('disconnect', () => {
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
        io.emit('user-disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
