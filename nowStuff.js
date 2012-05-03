function joinRoom(roomName) {
    //join the room via node
    now.changeRoom(roomName);

    //TODO: update equation here

}

function makeAndJoinRoom(roomName) {
    //make the room, now with a default equation
    now.makeRoom(roomName,{'eq':'x + y'});
    //will join automatically once its made
}

function changeRoomEquation(equationString) {

}

function doNodeStuff() {
    if(!window.now)
    {
        alert("no now.js detected, entering no-network mode");
    }

    now.ready(function() {
        defineNowFunctions();
        roomUpdate();
    });
}

function defineNowFunctions() {
    now.receiveNetworkMinimum = function(minPos) {
        //go to the current solver's saver
        if(!window.solver)
        {
            return;
        }

        solver.minSaver.receiveNetworkMin(minPos);
    };

    now.receiveTotal = function(total) {
        now.total = total;

        //TODO: update the bounds

    };

    now.receiveEquation = function(equationInfo) {

        //TODO: will basically make a new problem and all of that stuff, hopefully call to
        //aux method
    };

    now.receiveMessage = function(message) {
        //append to the message dom
        $j('#networkMessages').prepend('<p>' + message + '</p>');
        console.log("NOW MESSAGE" + message);
    };
}

function roomUpdate() {

    //first check if we are being linked to a room....
    var href = window.location.href;

    results = /room=(\w+)/.exec(href);
    var room = null;

    if(results)
    {
        //we got linked to a room, go join it
        room = results[1];
        joinRoom(room);
    }
    else
    {
        //make room
        room = randomString(5);
        makeAndJoinRoom(room);
        //link room
        history.pushState(null,'Genetic GPU!',"?room=" + room);
    }
}

