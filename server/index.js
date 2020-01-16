// Setup basic express server
var express = require('express'),bodyParser = require('body-parser');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var s_redis = require('socket.io-redis');
var port = process.env.PORT || 3000;
var serverName = process.env.NAME || 'Unknown';

io.adapter(s_redis({ host: 'redis', port: 6379 }));

var redis = require('redis');
const client = redis.createClient(6379,'redis'); 
client.on('connect', () => {
  console.log('Redis client connected');
});


var io_client = require('socket.io-client');
var socket_client = io_client.connect('http://localhost:3000', {reconnect: true});
var connectedUsers = {};



//server requset sendding groupd message
app.use(bodyParser.json());
app.post('/server_msg/multiUser', function(request, response){
  console.log(request.body);      // your JSON
   response.send(request.body);    // echo the result back
   var msg = request.body;
	socket_client.on('connect', function (socket_client) {
		console.log('Connected!');
	});
   console.log('to_group_msg %s', msg['MsgBody']);
   socket_client.emit('to_group_msg',msg['MsgBody']);

});

server.listen(port, function () {
  console.log('Server2 listening at port %d', port);
  console.log('Hello2, I\'m %s, how can I help?', serverName);
});

// Routing
app.use(express.static(__dirname + '/public'));

// Chatroom

var numUsers = 0;


function rpop_all(msg_list_key,socket) {
  	client.lpop(msg_list_key, function(err, reply) {
		console.log("left pop from %s + %s",msg_list_key,reply);
		if (reply != null){
			socket.emit('new message', {username: socket.username, message: reply});
			rpop_all(msg_list_key,socket)
		}
	});
}

io.on('connection', (socket) => {
  socket.emit('my-name-is', serverName);
  var addedUser = false;
  var msg;
  // when the client emits 'new message', this listens and executes
  socket.on('new message', (data) => {
    // we tell the client to execute 'new message'
	console.log("new message %s",data);
    socket.broadcast.emit('new message', {
      username: socket.username,
      message: data
    });
  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', (username) => {
	console.log('add user %s', username);
	client.get(username, (error, result) => {
	  if (error) {
		console.log(error);
		throw error;
	  }
	  console.log('GET result ->' + result);
	  if (result == null || io.sockets.connected[result] == null){
		console.log('result == null add user %s', username);
		socket.username = username;
		client.set(username, socket.id, redis.print);
		//retreive off line message
		
		var msg_list_key = "msg_list_key_" + username;
		console.log('retreive off line message %s', username);
		rpop_all(msg_list_key,socket)
		
	  }
	});
	/*
    if (addedUser) return;
	connectedUsers[username] = socket;
    // we store the username in the socket session for this client
    socket.username = username;
	*/
    ++numUsers;
    addedUser = true;
    socket.emit('login', {
      numUsers: numUsers
    });
    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', () => {
    if (addedUser) {
      --numUsers;
	  client.get(socket.username, (error, result) => {
		if (error) {
			console.log(error);
			throw error;
		}
		console.log('User levae name = %s, id = %d  ->' + socket.username , result);
		client.del(socket.username, function(err, response) {
			if (response == 1) {
				console.log("Deleted Successfully!")
			} else{
				console.log("Cannot delete")
			}
		})
	});
      // echo globally that this client has left
	  console.log('user left %s', socket.username);
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });
  // on server join group
  socket.on("join", function(room) {
   console.log('join %s', room);
   socket.join(room);
    socket.to(room).emit('new message', {
      username: socket.username,
      message: ' join ' + room
    });
  });

   // send msg to group
  socket.on("new group_msg", (room,msg) => {
    console.log('to_group_msg %s %s',room, msg['MsgBody']);
    socket.to(room).emit('new message', {
      username: socket.username,
      message: msg
    });
  });
   // send msg to group
  socket.on("to_group_msg", msg => {
	console.log('to_group_msg %s', msg['MsgBody']);
	socket.to('8888').emit('new message', {
      username: 'Group Message',
      message: msg
    });
  });
   // send c2c_msg to group
  socket.on("c2c_msg",(username, msg) => {
	console.log('new msg %s', msg);
	
	var msg_list_key = "msg_list_key_" + username;
	
	client.rpush([msg_list_key,msg], function(err, reply) {
		console.log("right push into %s + %s , reply = %s",msg_list_key,msg,reply);
		console.log(reply); //prints 2
	});
	client.get(username, (error, result) => {
	  if (error) {
		console.log(error);
		throw error;
	  }
	  console.log('GET result ->' + result);

	  if (result == null){
		console.log('c2c_msg result == null , user_id %s not online', username);
		//user not online, save message
		//socket.username = username;
		//client.set(username, socket, redis.print);
	  }
	  else{
		client.blpop(msg_list_key, 0, function(err, reply) {
			console.log("left pop from %s",msg_list_key);
			console.log('c2c_msg  result.emit');
			if (io.sockets.connected[result] != null){
				console.log('msg = %s', msg)
				console.log('reply = %s', reply)
				io.sockets.connected[result].emit('new message', {username: socket.username, message: reply[1]});
			}
			else{
				console.log("io.sockets.connected[result] == null");
				client.del[result];
			}
		});

	  }
	});
	/*
	if (id in connectedUsers){
		console.log('id %id', id);
		connectedUsers[id].emit('new message', {username: socket.username, message: msg});
	}*/
	/*
	socket.broadcast.emit('new message', {
      username: 'Group Message',
      message: msg
    });
	socket.to('8888').emit('new message', {
      username: 'Group Message',
      message: msg
    });*/
  });
  // on server levae group
  socket.on("leave", function(room) {
   console.log('leave %s', room);
   socket.leave(room);
    socket.to(room).emit('new message', {
      username: socket.username,
      message: ' leave ' + room
    });
  });
});
