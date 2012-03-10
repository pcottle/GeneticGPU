var fs = require('fs');

var server = require('http').createServer(function(req, response){

    console.log(req.url);
    
    //landing page -> give landing page

    var pageToGive;

    if(req.url == '/')
    {
        pageToGive = '/landing.html';
    }
    if(/roomSlave/.exec(req.url))
    {
        pageToGive = '/roomSlave.html';
    }
    if(/roomMaster/.exec(req.url))
    {
        pageToGive = '/roomMaster.html';
    }

    //room page -> give the room page

    fs.readFile(__dirname+pageToGive, function(err, data){

          response.writeHead(200, {'Content-Type':'text/html'}); 
          response.write(data);  
          response.end();
    });

});

var port = process.env.PORT || 8080;

server.listen(port);


var nowjs = require("now");
var everyone = nowjs.initialize(server);


nowjs.on('connect', function(){
    this.now.room = "room 1";
    nowjs.getGroup(this.now.room).addUser(this.user.clientId);
    console.log("Joined: " + this.now.name);
});


everyone.now.getPeopleInRoom = function(roomName,callback) {
    console.log("getting peeps in room " + roomName);
    nowjs.getGroup(roomName).getUsers(function(users) { console.log("the number of users!"); console.log(users.length); callback(users.length);});

};

nowjs.on('disconnect', function(){
    console.log("Left: " + this.now.name);
});

everyone.now.changeRoom = function(newRoom){
    nowjs.getGroup(this.now.room).removeUser(this.user.clientId);
    nowjs.getGroup(newRoom).addUser(this.user.clientId);
    this.now.room = newRoom;
    this.now.receiveMessage("SERVER", "You're now in " + this.now.room);
}

everyone.now.distributeMessage = function(message){
    nowjs.getGroup(this.now.room).now.receiveMessage(this.now.name, message);
};
