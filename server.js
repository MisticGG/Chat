// Import required modules
const WebSocket = require('ws');
const bcrypt = require('bcrypt'); // Password hashing library
const { MongoClient, ServerApiVersion } = require('mongodb');

// MongoDB connection URI
const uri = "mongodb+srv://Admin:M2OVJgzIzekpEjEX@chatapp.h0po0.mongodb.net/?retryWrites=true&w=majority&appName=ChatApp";
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// WebSocket Server setup
const wss = new WebSocket.Server({ port: 8080 });

// Password hashing configuration
const SALT_ROUNDS = 10;

// Connect to MongoDB
async function run() {
    try {
        await client.connect();
        console.log("Connected to MongoDB!");
        const db = client.db("SnippetDatas");
        const usersCollection = db.collection("Users");
        const messagesCollection = db.collection("Messages");

        // WebSocket connection event
        wss.on('connection', (ws) => {
            console.log("New client connected!");

            // Handle incoming messages
            ws.on('message', async (rawMessage) => {
                const data = JSON.parse(rawMessage);

                switch (data.action) {
                    case "join":
                        console.log(`${data.username} attempting to join.`);
                        const existingUser = await usersCollection.findOne({ username: data.username });

                        if (existingUser) {
                            // User exists, validate password
                            const isValidPassword = await bcrypt.compare(data.password, existingUser.password);
                            if (isValidPassword) {
                                console.log(`${data.username} authenticated successfully.`);
                                ws.send(JSON.stringify({ action: "auth", status: "success" }));

                                // Send chat history
                                const chatHistory = await messagesCollection.find().toArray();
                                ws.send(JSON.stringify({
                                    action: "load",
                                    content: chatHistory
                                }));

                                // Notify all clients about the user joining
                                broadcast({
                                    action: "info",
                                    username: "SERVER",
                                    message: `${data.username} joined the chat!`
                                });
                            } else {
                                console.warn(`Authentication failed for ${data.username}.`);
                                ws.send(JSON.stringify({ action: "auth", status: "failed", message: "Invalid password." }));
                            }
                        } else {
                            // User does not exist, create a new user
                            const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
                            await usersCollection.insertOne({
                                username: data.username,
                                password: hashedPassword
                            });
                            console.log(`New user ${data.username} created.`);

                            ws.send(JSON.stringify({ action: "auth", status: "success", message: "Account created." }));

                            // Notify all clients about the new user
                            broadcast({
                                action: "info",
                                username: "SERVER",
                                message: `${data.username} joined the chat as a new user!`
                            });
                        }
                        break;

                    case "chat":
                        console.log(`${data.username}: ${data.message}`);
                        // Save the message to the database
                        await messagesCollection.insertOne({
                            username: data.username,
                            message: data.message,
                            time: data.time
                        });

                        // Broadcast the message to all connected clients
                        broadcast({
                            action: "chat",
                            username: data.username,
                            message: data.message,
                            time: data.time
                        });
                        break;

                    case "leave":
                        console.log(`${data.username} left!`);
                        // Notify all clients about the user leaving
                        broadcast({
                            action: "info",
                            username: "SERVER",
                            message: `${data.username} left the chat!`
                        });
                        break;

                    default:
                        console.warn(`Unknown action: ${data.action}`);
                        break;
                }
            });

            // Handle client disconnection
            ws.on('close', () => {
                console.log("Client disconnected!");
            });
        });

    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
}

// Helper function to broadcast messages to all connected clients
function broadcast(message) {
    const messageString = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageString);
        }
    });
}

// Start the server
run().catch(console.error);
console.log('WebSocket server is running on ws://localhost:8080/');
