var fs = require('fs');

var server = require('http').createServer(function(req, response){

    var pageToGive = '/index.html';

    fs.readFile(__dirname+pageToGive, function(err, data){

          response.writeHead(200, {'Content-Type':'text/html'}); 
          response.write(data);  
          response.end();
    });
});

var port = process.env.PORT || 8080;
server.listen(port);

console.log("running server on ",port);

var nowjs = require("now");
var everyone = nowjs.initialize(server, {socketio: {transports: ['xhr-polling', 'jsonp-polling']}});

nowjs.on('connect', function(){
    this.now.room = "lobby";
    nowjs.getGroup(this.now.room).addUser(this.user.clientId);
    console.log(this.now.name + " joined the lobby");
});

nowjs.on('disconnect', function(){
    console.log("Left: " + this.now.name + "from room", this.now.room);
});

everyone.now.changeRoom = function(newRoom){
    nowjs.getGroup(this.now.room).removeUser(this.user.clientId);
    nowjs.getGroup(newRoom).addUser(this.user.clientId);

    this.now.room = newRoom;

    this.now.receiveMessage("SERVER", "You're now in " + this.now.room);
    console.log(this.now.name, "joined the room ", this.now.room);
}

everyone.now.distributeMessage = function(message){
    nowjs.getGroup(this.now.room).now.receiveMessage(this.now.name, message);
};

