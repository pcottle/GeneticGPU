var fs = require('fs');
var server = require('http').createServer(function(req, response){
  fs.readFile(__dirname+'/multiroomchat.html', function(err, data){
    response.writeHead(200, {'Content-Type':'text/html'}); 
    response.write(data);  
    response.end();
  });
});

server.listen(8080);
console.log("server listening on port 8080");

var nowjs = require("now");
var everyone = nowjs.initialize(server, {socketio: {transports: ['xhr-polling', 'jsonp-polling']}});


nowjs.on('connect', function(){
  this.now.room = "room 1";
  nowjs.getGroup(this.now.room).addUser(this.user.clientId);
  console.log("Joined: " + this.user.clientId);
});


nowjs.on('disconnect', function(){
  console.log("Someone left with client id",this.user.clientId);
});


roomInfo = {};

everyone.now.makeRoom = function(newRoom,equationInfo) {

    if(roomInfo[newRoom])
    {
        this.now.receiveMessage("That room is already created!");
        return;
    }

    //we need to initialize some things about roomInnfo
    roomInfo[newRoom] = equationInfo;

    this.now.receiveMessage("You have now made the room " + newRoom + ", transferring you...");
    this.now.changeRoom(newRoom);
};

everyone.now.changeRoom = function(newRoom){

  if(!roomInfo[newRoom])
  {
      this.now.receiveMessage("You need to make a room first silly!");
      return;
  }

  //tell only this client that they are leaving
  this.now.distributeMessage("Hey everyone in group " + this.now.room + ", this person " + this.user.clientId + " is leaving");

  //remove them from the group and get the new one
  nowjs.getGroup(this.now.room).removeUser(this.user.clientId);
  nowjs.getGroup(newRoom).addUser(this.user.clientId);

  //set the room and tell them that they have joined
  this.now.room = newRoom;
  this.now.distributeMessage("Hey everyone in group " + this.now.room + ", this person" + this.user.clientId + " is entering!");

  //we need to tell them how many are in the room
  var _this = this;
  nowjs.getGroup(this.now.room).count(function(count){

        _this.now.receiveMessage("You're now in " + _this.now.room + " and worker number " + count);
        _this.now.position = count;
        _this.now.receiveEquation(roomInfo[_this.now.room]);
        _this.now.distributeNewTotal(count);
  });
}

everyone.now.distributeMessage = function(message){
  nowjs.getGroup(this.now.room).now.receiveMessage(message);
};

everyone.now.distributeEquation = function(equationInfo) {
    nowjs.getGroup(this.now.room).now.receiveEquation(equationInfo);
};

everyone.now.distributeNewTotal = function(totalCount) {
    nowjs.getGroup(this.now.room).now.receiveTotal(totalCount);
};


