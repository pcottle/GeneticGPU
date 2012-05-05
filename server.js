var fs = require('fs');

var server = require('http').createServer(function (req, response) {
    fs.readFile(__dirname + '/multiroomchat.html', function (err, data) {
        response.writeHead(200, {
            'Content-Type': 'text/html'
        });
        response.write(data);
        response.end();
    });
});

var port = process.env.PORT || 8080;
server.listen(port);
console.log("server listening on port " + String(port));

var nowjs = require("now");
var everyone = nowjs.initialize(server, {
    socketio: {
        transports: ['xhr-polling', 'jsonp-polling']
    }
});


nowjs.on('connect', function () {
    this.now.firstRoom = "lobby";
    nowjs.getGroup(this.now.firstRoom).addUser(this.user.clientId);
});


nowjs.on('disconnect', function () {
    console.log("Someone left with client id", this.user.clientId);
});


roomInfo = {};

everyone.now.makeRoom = function (newRoom, equationInfo) {

    //we need to initialize some things about roomInnfo
    roomInfo[newRoom] = equationInfo;

    this.now.receiveMessage("You have now made / updated the room " + newRoom + ", transferring you...");
    this.now.changeRoom(newRoom);
};

everyone.now.clearAllRooms = function () {
    roomInfo = {};
    this.now.receiveMessage("you have cleared all rooms");
};

everyone.now.changeEquation = function (roomName, equationInfo) {
    var room = roomName;

    if (!roomInfo[room]) {
        this.now.receiveMessage("You haven't made that room," + String(room) + " yet");
        return;
    }

    roomInfo[room] = equationInfo;

    nowjs.getGroup(room).now.receiveMessage("NETWORK: Changing equation to " + equationInfo.equationString);
    nowjs.getGroup(room).exclude([this.user.clientId]).now.receiveEquation(equationInfo);
};

everyone.now.changeRoom = function (newRoom) {

    if (!roomInfo[newRoom]) {
        this.now.receiveMessage("You need to make a room first silly!");
        return;
    }

    if (this.now.room) {
        //tell only this client that they are leaving
        this.now.distributeMessage("Hey everyone in group " + this.now.room + ", this person " + String(this.user.clientId).substring(0, 5) + " is leaving");
        nowjs.getGroup(this.now.room).removeUser(this.user.clientId);
    } else {
        nowjs.getGroup('lobby').removeUser(this.user.clientId);
    }

    //remove them from the group and get the new one
    nowjs.getGroup(newRoom).addUser(this.user.clientId);

    //set the room and tell them that they have joined
    this.now.room = newRoom;
    this.now.distributeMessage("Hey everyone in group " + this.now.room + ", this person" + String(this.user.clientId).substring(0, 5) + " is entering!");

    //we need to tell them how many are in the room
    var _this = this;
    nowjs.getGroup(this.now.room).count(function (count) {

        _this.now.receiveMessage("You're now in " + _this.now.room + " and worker number " + count);
        _this.now.position = count;
        _this.now.distributeNewTotal(count);
        _this.now.receiveEquation(roomInfo[_this.now.room]);
        _this.now.receiveRoom(_this.now.room);
    });
}

everyone.now.distributeMessage = function (message) {
    nowjs.getGroup(this.now.room).now.receiveMessage(message);
};

everyone.now.distributeNewTotal = function (totalCount) {
    nowjs.getGroup(this.now.room).now.receiveTotal(totalCount);
};

everyone.now.distributeMinimum = function (minimumPos) {
    console.log("distributing minimum to group ", this.now.room, "and this min", minimumPos);
    nowjs.getGroup(this.now.room).now.receiveNetworkMinimum(minimumPos);
};
