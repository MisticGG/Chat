const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

const server = https.createServer({
  cert: fs.readFileSync('/path/to/cert.pem'),
  key: fs.readFileSync('/path/to/key.pem')
});

const wss = new WebSocket.Server({ server });

wss.on('connection', socket => {
  socket.on('message', message => {
    console.log(`Received: ${message}`);
    socket.send(`Hello, you sent -> ${message}`);
  });

  socket.send('Welcome to WebSocket over HTTPS!');
});

server.listen(8080);
