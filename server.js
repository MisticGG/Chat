// Import webSocket module
const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');
const bcrypt = require("bcrypt")
// Import mongodb module
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://Admin:M2OVJgzIzekpEjEX@chatapp.h0po0.mongodb.net/?retryWrites=true&w=majority&appName=ChatApp";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const server = https.createServer({
  cert: fs.readFileSync('/etc/letsencrypt/live/privatechatapp.duckdns.org/fullchain.pem'),
  key: fs.readFileSync('/etc/letsencrypt/live/privatechatapp.duckdns.org/privkey.pem'),
});

const wss = new WebSocket.Server({ server });

server.listen(8080, () => {
  console.log('Server WebSocket is listening on wss://privatechatapp.duckdns.org:8080');
});

const users = new Map();

// On connection
async function run(){
  try{
    await client.connect();
    console.log("Successfully connected to MongoDB!");
    const db = client.db("SnippetData");
    const collection = db.collection("Messages");
    wss.on('connection', (ws) => {
      console.log("New connection!")
      let username = "unknown";
      // On message reception
      ws.on('message', async (message) => {
        const data = JSON.parse(message);
        const Compte = await db.collection("Comptes").findOne({"username":username});
        if (data.action === "chat"){
          if (users.get(username) === ws){
            if (!data.message || data.message.lenght > 1000){console.log("illegal message");}
            else if (Compte.isOp && data.message.startsWith("/kick ")){
              const userKicked = data.message.slice(6);
              try{
                users.get(userKicked).close();
              }catch(err){
                ws.send(JSON.stringify({
                  "action":"info",
                  "username":"SERVER",
                  "message":"No user found"
                }))
              };
            }
            else if (Compte.isOp && data.message.startsWith("/ban ")){
              const userBan = data.message.slice(5);
              await db.collection("Comptes").updateOne({username:userBan},{$set:{isBanned:true}});
              try{
                users.get(userBan).close();
              }catch(err){
                ws.send(JSON.stringify({
                  "action":"info",
                  "username":"SERVER",
                  "message":"No user found"
                }))
              };
            }
            else if (Compte.isOp && data.message.startsWith("/unban ")){
              const userDeban = data.message.slice(7);
              await db.collection("Comptes").updateOne({username:userDeban},{$set:{isBanned:false}});
            }
            else if (Compte.isOp && data.message.startsWith("/op ")){
              const userOp = data.message.slice(4);
              await db.collection("Comptes").updateOne({username:userOp}, {$set:{isOp:true}});
            }
            else if (Compte.isOp && data.message.startsWith("/deop ")){
              const userDeop = data.message.slice(6);
              await db.collection("Comptes").updateOne({username:userDeop},{$set:{isOp:false}});
            }
            else {
              // Log Message;
              console.log(`${username}: ${data.message}`);
              // Insert in DataBase
              await collection.insertOne({
                "action":"chat",
                "username":username,
                "time":data.time,
                "message":data.message
              });
              // Send the message to everyone
              sendToAll(users, {
                  "action":"chat",
                  "username":username,
                  "time":data.time,
                  "message":data.message
              });
            }
          }
          else{
            ws.send(JSON.stringify({
              "action":"info",
              "username":"SERVER",
              "message":"Illegal connexion!"
            }))
          }
        } 
        else if (data.action === "join"){
          username = data.username;
          const isLegal = username && data.password  && !users.has(username) && isGood(username);
          const Compte = await db.collection("Comptes").findOne({"username":username});
          if ((Compte && verifyPassword(data.password, Compte.password) && !Compte.isBanned && isLegal) || (!Compte && isLegal)){
            if (!Compte){
              ws.send(JSON.stringify({
                "action":"info",
                "username":"SERVER",
                "message":"You created a new account!"
              }))
              await db.collection("Comptes").insertOne({
                "username":username,
                "password": await hashPassword(data.password),
                "isBanned":false,
                "isOp":false
              })
              console.log(`${data.username} created an account!`);
            }
            users.set(username, ws);
            let documents = await collection.find().toArray();
            let object = {"action":"load", "content":documents};
            ws.send(JSON.stringify(object))
            console.log(`${data.username} joined!`);
            console.log("sent data")
            sendToAll(users, {
              username: "SERVER",
              message: `${data.username} joined!`,
              action: "info",
            })
          }
          else{
            console.log("Connection was illegal!")
            ws.send(JSON.stringify({
              "action":"info",
              "message":"Illegal connection!",
              "username":"SERVER"
            }))
          }
        }
        else if(data.action == "file"){
          if (users.get(username) === ws){
            console.log(username + " send a file");
            await collection.insertOne(data)
            sendToAll(users, {
              "action": "file",
              "username": username,
              "time": data.time,
              "fileName": data.fileName,
              "fileData": data.fileData,
              "fileType": data.fileType
            });
          }
        }
        else if (data.action == "ping"){
          ws.send(JSON.stringify({
            "action": "pong"
          }));
        }
      });

      // On disconnect
      ws.on('close', () => {
        for (const [username, socket] of users.entries()) {
          if (socket === ws) {
              users.delete(username);
          }
        }
        console.log("Connection lost with " + username + "!")
        sendToAll(users, {
          username: "SERVER",
          message: username + " left!",
          action: "info",
        })
      });
    });
  } catch (err){console.error(err)};
};
run();
// Server location log

function isGood(str) {
  return typeof str === 'string' && str.length >= 3 && str.length <= 15 && !/^\s*$/.test(str) && !/^\d/.test(str) && /^[a-zA-Z0-9 ]+$/.test(str);
}

async function hashPassword(password) {
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);
  console.log("New password created!")
  return hash;
}

async function verifyPassword(password, storedHash) {
  try{
    const match = await bcrypt.compare(password, storedHash);
    console.log("Password is good: ", match)
    return match;
  }
  catch(err){
    return false
  }
}

function sendToAll(usersMap, Object) {
  console.table(Array.from(usersMap.entries()));
  usersMap.forEach((ws, username) => {
    ws.send(JSON.stringify(Object));
  });
}

function msg(users, text, you, him){
  const recipient = users.get(him);
  try{
    recipient.send(JSON.stringify({
      "action":"chat",
      "message":text,
      "username":you
    }))
    return true;
  }
  catch(err){
    return False
  }
}
