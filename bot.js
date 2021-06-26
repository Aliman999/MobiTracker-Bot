'use strict';
const prefix = '!';
const config  = require('./config');
const { Client, MessageEmbed } = require('discord.js');
const WebSocket = require('ws');
const CryptoJS = require('crypto-js');
const Bottleneck = require('bottleneck');
const MySQLEvents = require('@rodrigogs/mysql-events');
const fs = require('fs');
const https = require('https');
const mysql = require('mysql');
const client = new Client();
const schedule = require('node-schedule');
require('console-stamp')(console, {
    format: ':date(mm/dd/yyyy HH:MM:ss)'
});
var jwt = require('jsonwebtoken');
var webSocket = null;
var discordClients = [];
var position = [];
var update = [];
var failed = [];
var updateBool = true;
var concurrent = 2;

const group = new Bottleneck.Group({
    maxConcurrent: concurrent,
    minTime:3000
});

const jobQueue = new Bottleneck({
  maxConcurrent: 3,
});

const queueCounts = jobQueue.counts();

jobQueue.on("received", function(info){
  position.push({ id:info.options.id, priority:info.options.priority, message:info.args[2], msg:info.args[3], len:info.args[0] });
  position.sort((a, b) => {
      return a.priority - b.priority;
  });
});

jobQueue.on("queued", function(info){
  console.save(jobQueue.jobs("QUEUED").join(", ")+" in Queue");
  position.forEach((e, iii) => {
    if(position.length > 1){
      e.msg.edit("**[STATUS]: ** \u231A ```"+(iii+1)+" in Queue. Servers are busy, please wait in queue.```");
    }
  });
});

jobQueue.on("executing", function(info){
  console.save(jobQueue.jobs("EXECUTING").join(", ")+" executing");
});

jobQueue.on("done", function(info){
  console.save(info.options.id+" Finished.");
});

group.on("created", (limiter, key) => {
  console.log(key);
  var count = 0;
  var subCount = 0;
  var bool = true;
  limiter.on("received", function(info){
    if(subCount == 0){
      info.args[3].edit("**[STATUS]: ** \u2699 ```Running.```");
    }
    subCount++;
    if(subCount == info.args[5]){
      for(var ind = 0; ind < position.length; ind++){
        console.log(position[ind].id +" | "+key);
        if(position[ind].id === key){
          position.splice(ind, 1);
        }
        for(var ii = 0; ii < position.length; ii++){
          position[ii].msg.edit("**[STATUS]: ** \u231A ```"+(ii+1)+" in Queue. Servers are busy, please wait in queue.```");
        }
      }
    }
  })
  limiter.on("done", function(info){
    count++;
    console.log(count+" | "+info.args[5]+" - "+info.args[6]);
    if(count == info.args[5]){
      for(var ind = 0; ind < position.length; ind++){
        if(position[ind].id === info.options.id){
          position.splice(ind, 1);
        }
        for(var ii = 0; ii < position.length; ii++){
          position[ii].msg.edit("**[STATUS]: ** \u231A ```"+(ii+1)+" in Queue. Servers are busy, please wait in queue.```");
        }
      }
      info.args[2].channel.send("**[STATUS]: ** :floppy_disk: ```Finished "+info.args[5]+" searches.```");
      console.log('Finished '+info.args[4]+"'s Job");
      group.deleteKey(info.args[4]);
    }
  })

  limiter.on("failed", async (error, jobInfo) => {
    if(jobInfo.retryCount < 2){
      return 1000;
    }else{
      jobInfo.args[2].channel.send("**[ERROR]: ** :tools: ```3 Attemps to find "+jobInfo.args[0]+" Failed```");
      cachePlayer(jobInfo.args[0]);
    }
  });
});

const botToken = jwt.sign({ mtUser:{username:'mtcobot', cid: '0000001'} }, config.Secret, { algorithm: 'HS256' }, { 'iat':Math.floor(Date.now()/1000) });
const msg = {
  type:"bot",
  token: botToken
};

client.on("ready", () => {
  console.log(`MobiTracker Bot has started, with ${client.users.cache.size} users, in ${client.channels.cache.size} channels over ${client.guilds.cache.size} servers.`);
  var i = 0;
  const list = ["for !help", "for new Contracts", "for new Applicants", "for new Reviews"];
  function loopStatus(){
    setTimeout(function(){
      client.user.setPresence({
        status: 'online',
        activity: {
            name: list[i],
            type: "WATCHING"
        }
      });
      i++;
      if (i < list.length) {
        loopStatus();
      }else{
        i = 0;
        loopStatus();
      }
    }, 10000)
  }

  loopStatus();
});

function getKey(){
  return new Promise(callback =>{
    var apiKey;
    const sql = "SELECT id, apiKey, count FROM apiKeys WHERE note like '%main%' GROUP BY id, apiKey, count ORDER BY count desc LIMIT 1";
    con.query(sql, function (err, result, fields){
      if(err) throw err;
      apiKey = result[0].apiKey;
      var id = result[0].id;
      const sql = "UPDATE apiKeys SET count = count-1 WHERE id = "+id;
      con.query(sql, function (err, result, fields){
        if(err) throw err;
        callback(apiKey);
      })
    });
  })
}

function getPrio(usrID){
  return new Promise(cbPrio =>{
    const sql = "SELECT priority FROM discord WHERE discID = "+usrID+";";
    con.query(sql, function (err, result, fields){
      if(err) throw err;
      if(result.length > 0){
        cbPrio(result[0].priority);
      }else{
        cbPrio(9);
      }
    });
  })
}

async function addQueue(message, args){
  var msg = await message.channel.send("**[STATUS]:** :hourglass: ```Our microtech datacenters are processing your request.```");
  message.author.prio = await getPrio(message.author.id);
  if(message.author.id != "751252617451143219"){
    if(message.channel.type == "text"){
      if(args.length > 1){
        console.log(message.author.tag+" ["+message.author.prio+"]"+" starting search for "+args.length+" users in the "+message.guild.name+' server');
      }else{
        console.log(message.author.tag+" ["+message.author.prio+"]"+" starting search for "+args.length+" user in the "+message.guild.name+' server');
      }
    }else{
      if(args.length > 1){
        console.log(message.author.tag+" ["+message.author.prio+"]"+" starting search for "+args.length+" users in "+message.channel.type+'s');
      }else{
        console.log(message.author.tag+" ["+message.author.prio+"]"+" starting search for "+args.length+" user in "+message.channel.type+'s');
      }
    }
  }
  jobQueue.schedule({ id:message.author.username, priority:message.author.prio }, lookUp, args.length, message, args, msg);
}

async function lookUp(count, message, args, msg){
  var args = args;
  var key;
  var percent, nodupe = 0;
  await getKey(args.length).then(async (result) => {
    key = result;
  });
  async function query(args, key, message){
    await queryApi(args, key)
    .then((result)=>{
      if(result.status == 0){
        throw new Error(result.data);
      }else{
        message.channel.send(result.data);
      }
    })
  }
  var wait = setInterval(()=>{
    if(position.length < 3){
      clearInterval(wait);
      for(var i = 0; i < args.length; i++){
        if(message.author.id != "751252617451143219"){
          var logMsg = message.author.tag+' searched for '+args[i];
        }
        group.key(message.author.username).schedule(query, args[i], key, message, msg, message.author.tag, args.length, logMsg)
        .catch((error) => {
          if (error instanceof Bottleneck.BottleneckError) {
            console.log(error.message);
          }
        });
      }
    }else{
      position.forEach((e, iii) => {
        if(position.length > 1){
          e.msg.edit("**[STATUS]: ** \u231A ```"+(iii+1)+" in Queue. Servers are busy, please wait in queue.```");
        }
      });
    }
  }, 3000);
}

schedule.scheduleJob('* * 0 * *', function(){
  var stats = {
    users: client.users.cache.size,
    channels: client.channels.cache.size,
    servers: client.guilds.cache.size
  };
  saveStats(stats);
});

function saveStats(stats){
  const sql = "INSERT INTO discordStats (users, channels, servers) VALUES ("+stats.users+", "+stats.channels+", "+stats.servers+");";
  con.query(sql, function (err, result, fields){
    if(err) throw err;
  });
}

function socket(){
  var payload = jwt.sign({ username:"bot" }, config.Secret);
  var message;
  webSocket = new WebSocket("wss://mobitracker.co:2599");
  webSocket.onopen = function(){
    console.log("Connected to Internal API");
    message = {
      type:"auth",
      token:payload
    };
    webSocket.send(JSON.stringify(message));
    heartbeat();
  }
  webSocket.onerror = function(err){
  }
  webSocket.onclose = function(){
    console.log("Lost Connection to Internal API");
    setTimeout(socket, 3000);
  };

  function heartbeat() {
    if (!webSocket) return;
    if (webSocket.readyState !== 1) return;
    webSocket.send(JSON.stringify({type:"ping"}));
    setTimeout(heartbeat, 3000);
  }
}


socket();

var trueLog = console.log;
console.log = function(msg) {
  const date = new Date();
  const day = ("0" + date.getDate()).slice(-2);
  const month = ("0" + (date.getMonth() + 1)).slice(-2);
  const year = date.getFullYear();
  fs.appendFile('/home/ubuntu/logs/bot.log', "["+month+"/"+day+"/"+year+" "+date.toLocaleTimeString('en-US')+"]"+" - "+msg+'\n', function(err) { if(err) {
      return trueLog(err);
    }
  });
  trueLog(msg);
}

var logSave = console.save;
console.save = function(msg) {
  const date = new Date();
  const day = ("0" + date.getDate()).slice(-2);
  const month = ("0" + (date.getMonth() + 1)).slice(-2);
  const year = date.getFullYear();
  fs.appendFile('/home/ubuntu/logs/bot.log', "["+month+"/"+day+"/"+year+" "+date.toLocaleTimeString('en-US')+"]"+" - "+msg+'\n', function(err) { if(err) {
      return trueLog(err);
    }
  });
}

var con = mysql.createPool({
  host: config.MysqlHost,
  user: config.MysqlUsername,
  password: config.MysqlPassword,
  database: config.MysqlDatabase,
  multipleStatements:true
});

con.getConnection(function(err, connection) {
  if (err) throw err;
});

function affiliations(aff){
  var display = "";
  if(aff != null){
    if(aff.length > 0){
      for (var i = 0; i < aff.length; i++) {
        if(!aff[i].name){
          display = display+"REDACTED"+'\n';
        }else{
          display = display+aff[i].rank+' ['+aff[i].stars+']'+' in '+'['+aff[i].name+']'+'(https://robertsspaceindustries.com/orgs/'+aff[i].sid+')'+'\n';
        }
      }
      return display;
    }else{
      return "None";
    }
  }else{
    return "None";
  }
}

function decodeEntities(encodedString) {
  return encodedString.replace('&#039;', "'");
}
function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getUserFromMention(mention) {
	if (!mention) return;

	if (mention.startsWith('<@') && mention.endsWith('>')) {
		mention = mention.slice(2, -1);

		if (mention.startsWith('!')) {
			mention = mention.slice(1);
		}

		return client.users.cache.get(mention);
	}
}

Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

function queryApi(args, apiKey){
  return new Promise(promiseSearch =>{
    var embed;
    var options = {
      hostname: 'api.starcitizen-api.com',
      port: 443,
      path: '/'+apiKey+'/v1/live/user/'+escape(args),
      method: 'GET'
    }
    const req = https.request(options, res =>{
      var body = "";
      res.on('data', d => {
        body += d;
      })
      res.on('error', error => {
        promiseSearch({status:0, data:args+" returned null, retrying"})
      })
      res.on('end', function(){
        try{
          var user = JSON.parse(body);
          if(user.data == null){
            promiseSearch({status:0, data:args+" returned null, retrying"});
          }
          if(Object.size(user.data) > 0){
            cachePlayer(user.data);
            if(Object.size(user.data.organization) > 1 && user.data.organization.name != ""){
              user.data.organization.name = user.data.organization.rank+' ['+user.data.organization.stars+']'+' in '+'['+user.data.organization.name+'](https://robertsspaceindustries.com/orgs/'+user.data.organization.sid+')';
            }else if (user.data.organization.name == ""){
              user.data.organization.name = "REDACTED";
            }else{
              user.data.organization.name = "None";
            }
            var cID = '';
            if(user.data.profile.id != 'n/a'){
              cID = " AND cID = "+user.data.profile.id.substring(1);
            }else{
              user.data.profile.id = '#No Citizen ID';
            }
            const sql = "SELECT reviewed_count as rating FROM players WHERE username = '"+user.data.profile.handle+"'"+cID+";";
            con.query(sql, function (err, result, fields) {
              if (err) throw err;

              var rating = "";
              if(result.length == 0){
                rating = "No Vouches. \n[Login](https://mobitracker.co/login) to vouch for them.";
              }else{
                if(result[0].rating == -1){
                  rating = "No Vouches. \n[Login](https://mobitracker.co/login) to vouch for them.";
                }else{
                  rating = xp(result[0].rating)+" ("+result[0].rating+")";
                }
              }
              user.data.profile.enlisted = new Date(user.data.profile.enlisted);
              user.data.profile.enlisted = ((user.data.profile.enlisted.getMonth() > 8) ? (user.data.profile.enlisted.getMonth() + 1) : ('0' + (user.data.profile.enlisted.getMonth() + 1))) + '/' + ((user.data.profile.enlisted.getDate() > 9) ? user.data.profile.enlisted.getDate() : ('0' + user.data.profile.enlisted.getDate())) + '/' + user.data.profile.enlisted.getFullYear();

              embed = new MessageEmbed()
                .setColor(0x25a6dd)
                .setAuthor(user.data.profile.handle+user.data.profile.id, user.data.profile.image, "https://mobitracker.co/"+user.data.profile.handle)
                .setDescription("AKA "+user.data.profile.display)
                .setThumbnail(user.data.profile.image)
                .addFields(
                  { name: 'Badge', value: user.data.profile.badge, inline: true},
                  { name: 'Mobitracker Vouchers', value: rating, inline: true},
                  { name: 'RSI Profile', value: "["+user.data.profile.handle+"](https://robertsspaceindustries.com/citizens/"+user.data.profile.handle+")", inline: true },
                  { name: 'Enlisted', value: user.data.profile.enlisted, inline: true}
                 )
                 .setFooter(user.data.profile.handle+' - Mobitracker.co', 'https://mobitracker.co/android-chrome-512x512.png');
              if(user.data.profile.location){
                embed.addFields(
                  { name: 'Location', value: user.data.profile.location.region+", "+user.data.profile.location.country, inline: true}
                );
              }else{
                embed.addFields(
                  { name: 'Location', value: "REDACTED", inline: true}
                );
              }
              if(user.data.profile.fluency){
                embed.addFields(
                  { name: 'Languages', value: user.data.profile.fluency.join(", "), inline: true}
                );
              }else{
                embed.addFields(
                  { name: 'Languages', value: "REDACTED", inline: true}
                );
              }
              embed.addFields(
                { name: 'Main Organization', value: user.data.organization.name },
                { name: 'Affiliated Organizations', value: affiliations(user.data.affiliation)}
              );
              promiseSearch({ status:1, data:embed });
            });
          }else{
            console.save(args+" returned null, retrying");
            promiseSearch({ status:0, data:null });
          }
        }catch(err){
          console.save("Failed to parse "+args);
          promiseSearch({ status:0, data:null });
        };
      })
    })
    req.end()
  });
}

function cachePlayer(user){
  if(typeof user === 'string'){
    const sql = "SELECT * FROM `CACHE players` WHERE username = '"+user+"'";
    con.query(sql, function (err, result, fields) {
      if(err) throw err;
      if(result.length > 0){
        const last = result.length-1;
        if(result[last].event != "Changed Name"){
          const sql = "INSERT INTO `CACHE players` (event, cID, username, bio, badge, organization, avatar) VALUES ( 'Changed Name', "+result[last].cID+", '"+result[last].username+"', ?, '"+result[last].badge+"', '"+result[last].organization+"', '"+result[last].avatar+"' );";
          con.query(sql, [result[last].bio], function (err, result, fields) {
            if(err) throw err;
          });
        }
      }
    });
  }else{
    var update = false;
    var eventUpdate = new Array();
    var check = { cID:0,
                  username:'',
                  badge: { src:'', title:'' },
                  organization: [],
                  avatar: ''
                };
    check.cID = parseInt(user.profile.id.substring(1));
    check.bio = JSON.stringify(user.profile.bio);
    if(!check.bio){
      check.bio = "";
    }
    check.username = user.profile.handle;
    check.badge.title = user.profile.badge;
    check.badge.src = user.profile.badge_image;
    check.avatar = user.profile.image;
    if(Object.size(user.affiliation) > 0){
      user.orgLength = Object.size(user.affiliation) + 1;
    }
    if(user.organization.sid){
      check.organization.push({ sid: user.organization.sid, rank: user.organization.stars });
    }else{
      check.organization.push({ sid: "N/A", rank: 0 });
    }
    for(var i = 0; i < Object.size(user.affiliation); i++){
      if(user.affiliation[i].sid){
        check.organization.push({ sid: user.affiliation[i].sid, rank: user.affiliation[i].stars });
      }else{
        check.organization.push({ sid: "N/A", rank: 0 });
      }
    }
    var sql = "";
    if(check.cID){
      sql = "SELECT cID, username, bio, badge, organization, avatar FROM `CACHE players` WHERE cID = "+user.profile.id.substring(1)+";";
    }else{
      check.cID = 0;
      sql = "SELECT cID, username, bio, badge, organization, avatar FROM `CACHE players` WHERE username = '"+user.profile.handle+"';";
    }
    con.query(sql, function (err, result, fields) {
      if(err) throw err;
      if(Object.size(result) > 0){
        var data = result[result.length-1];
        data.organization = JSON.parse(data.organization);
        data.organization = Object.values(data.organization);
        data.badge = JSON.parse(data.badge);
        for(var i = 0; i < Object.size(data); i++){
          if(i == 3){
            for(var x = 0; x < Object.size(data.organization) && x < Object.size(check.organization); x++){
              if(data.organization[x].sid != check.organization[x].sid){
                update = true;
                eventUpdate.push("Org Change");
              }else if(data.organization[x].rank != check.organization[x].rank){
                update = true;
                eventUpdate.push("Org Promotion/Demotion");
              }
            }
          }
        }
        if(data.cID != check.cID){
          update = true;
          eventUpdate.push("Obtained ID");
        }
        if(data.username != check.username){
          update = true;
          eventUpdate.push("Changed Name");
        }
        if(data.badge.title != check.badge.title){
          update = true;
          eventUpdate.push("Badge Changed");
        }
        if(data.avatar != check.avatar){
          update = true;
          eventUpdate.push("Avatar Changed");
        }
        if(data.bio != check.bio){
          update = true;
          eventUpdate.push("Bio Changed");
        }
        function removeDupe(data){
          return data.filter((value, index) => data.indexOf(value) === index)
        }
        eventUpdate = removeDupe(eventUpdate);
      }else{
        check.bio = JSON.stringify(check.bio);
        check.badge = JSON.stringify(check.badge);
        check.organization = JSON.stringify(Object.assign({}, check.organization));
        const sql = "INSERT INTO `CACHE players` (event, cID, username, bio, badge, organization, avatar) VALUES ('First Entry', "+check.cID+", '"+check.username+"', ?, '"+check.badge+"', '"+check.organization+"', '"+check.avatar+"' );";
        con.query(sql, [check.bio], function (err, result, fields) {
          if(err) throw err;
        });
      }
      if(update){
        check.bio = JSON.stringify(check.bio);
        check.badge = JSON.stringify(check.badge);
        check.organization = JSON.stringify(Object.assign({}, check.organization));
        var eventString = eventUpdate.join(", ");
        const sql = "INSERT INTO `CACHE players` (event, cID, username, bio, badge, organization, avatar) VALUES ('"+eventString+"', "+check.cID+", '"+check.username+"', ?, '"+check.badge+"', '"+check.organization+"', '"+check.avatar+"');";
        con.query(sql, [check.bio], function (err, result, fields) {
          if(err) throw err;
        });
      }
    });
  }
}


var truncate = function (elem, limit) {
	if (!elem || !limit) return;
	var content = elem.trim();
	content = content.split(' ').slice(0, limit);
	content = content.join(' ');
	elem = content+'...';
  return elem;
};

Object.size = function(obj) {
  var size = 0, key;
  for (key in obj) {
      if (obj.hasOwnProperty(key)) size++;
  }
  return size;
};


function readAttachment(message, url){
  const options = {
    hostname: 'cdn.discordapp.com',
    port: 443,
    path: url,
    method: 'GET'
  }
  const req = https.request(options, res =>{
    var body = "";
    res.on('data', d => {
      body += d;
    })
    res.on('error', error => {
      console.error(error)
    })
    res.on('end', async function(){
      if (!body.startsWith(prefix)) return;
      var args = body.slice(prefix.length).trim().split(/\s+/);
      const command = args.shift().toLowerCase();
      if(command === 'search'){
        if (!args.length){
      		return message.channel.send(`You didnt provide a username.`);
      	}
        if(args.length > 1){
          addQueue(message, args);
        }
      }
    })
  })
  req.end();
}

client.on('message', async message => {
  if (message.content.includes("https://robertsspaceindustries.com/citizens/")){
    var handle = message.content.split("/");
    handle = handle.pop();
    if(handle.includes(" ")) handle = handle.substr(0,handle.indexOf(' '));
    client.channels.cache.get("827064226807283722").send(message.member.user.tag+" linked a handle: "+handle);
    client.channels.cache.get("827064226807283722").send("!search "+handle);
  }else if (message.attachments){
    message.attachments.map((currElement, index) => {
      if(currElement.url.includes("message.txt")){
        readAttachment(message, currElement.url.slice(26));
      }
    });
  }
  if (!message.content.startsWith(prefix)) return;
  var args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  if (command === 'search'){
  	if (!args.length){
  		return message.channel.send(`You didnt provide a username.`);
  	}
    addQueue(message, args);
  }

  if(command == 'contracts'){
    showContracts(message, args);
  }

  if(command == 'alerts'){
    toggleAlerts(message, args);
  }

  if(command == 'register'){
    registerUser(message, args);
  }

  if(command == 'link'){
    registerUser(message, args);
  }

  if(command == 'help'){
    message.channel.send("MobiTracker's Discord bot is very simple to use! \n\n!help - Bring up this help message \n\n!search USERNAME - Find any user in the verse by their ingame name quickly and displaying all the information you'd find online at https://mobitracker.co \n\n !contracts PAGENUMBER - Search through MobiTrackers Contracts by the page number and See what people are doing! \n\n!auth - The command to authorize and edit your alert policies! \nGet your auth token at https://mobitracker.co/discord \n\n!alerts on/off - Pause and Resume your alert policy!");
  }

  if (!message.content.startsWith(`${prefix}`)) return;
});

async function registerUser(message, argz){
  if(argz.length > 0){
    await getKey().then(async (key) => {
      linkRSI(key);
    });
  }else{
    firstRegister();
  }
  async function linkRSI(key){
    const sql = "SELECT cID, username FROM discord WHERE discID = "+message.author.id;
    con.query(sql, function (err, result, fields) {
      if(err) throw err;
      if(result[0]){
        if(result[0].username){
          var username = JSON.parse(result[0].username);
          var cID = JSON.parse(result[0].cID);
        }else{
          var username = [];
          var cID = [];
        }
        var searchNames = [];
        var registeredName = [];
        var registeredCID = [];
        var registeredAvi = [];
        var failedNames = [];
        var alreadyLinked = [];
        var ii = 0;
        var tries = 0;
        var tempName = [];
        if(result[0].cID){
          result.forEach((item, i) => {
            tempName = JSON.parse(item.username.toLowerCase());
          });
        }
        var len = argz.length
        for(var xi = 0; xi < len; xi++){
          if(tempName.includes(argz[xi].toLowerCase())){
            alreadyLinked.push(argz[xi]);
          }else{
            searchNames.push(argz[xi]);
          }
        }
        if(searchNames.length == 0){
          message.channel.send("Failed: "+alreadyLinked.join(", ")+" (Already Registered)");
          return;
        }
        for(var i = 0; i < searchNames.length; i++){
          const options = {
            hostname: 'api.starcitizen-api.com',
            port: 443,
            path: '/'+key+'/v1/live/user/'+escape(searchNames[i]),
            method: 'GET'
          }
          retry(searchNames[i]);
          function retry(name){
            const req = https.request(options, res =>{
              var body = "";
              res.on('data', d =>{
                body += d;
              })
              res.on('error', err =>{
                console.log(err);
              });
              res.on('end', function(){
                const user = JSON.parse(body);
                if(!user.success){
                  console.log("Failed to find "+name+", retrying.");
                  tries++;
                  retry(name);
                }else{
                  if(Object.keys(user.data).length > 0){
                    if(user.data.profile.bio){
                      const bio = user.data.profile.bio.split(/\s+/);
                      if(user.data.profile.id == "n/a"){
                        user.data.profile.id = "";
                      }else{
                        user.data.profile.id = user.data.profile.id.substring(1);
                      }
                      for(var x = 0; x < bio.length; x++){
                        var encrypted = bio[x];
                        try{
                          var crypto = CryptoJS.AES.decrypt(encrypted, message.author.id).toString(CryptoJS.enc.Utf8);
                        }catch{
                        }
                        if(crypto == "mt.co"){
                          registeredName.push(user.data.profile.handle);
                          registeredCID.push(user.data.profile.id);
                          registeredAvi.push(user.data.profile.image);
                          x = bio.length;
                        }else{
                          if(x == bio.length-1){
                            failedNames.push(user.data.profile.handle);
                          }
                        }
                      }
                      if(ii == searchNames.length-1){
                        var rString = "", fString = "", aString = "", discString = "", discAString = "";
                        if(registeredName.length > 0){
                          rString = "Registered: "+registeredName.join(", ")+" ";
                          discString = "Registered: "+registeredName.join(", ")+" \n\n";
                        }
                        if(alreadyLinked.length > 0){
                          aString = "Already Linked: "+alreadyLinked.join(", ")+" ";
                          discAString = "Already Linked: "+alreadyLinked.join(", ")+" \n\n"
                        }
                        if(failedNames.length > 0){
                          fString = "Failed: "+failedNames.join(", ")+" (No Token/Wrong Token)";
                        }
                        var finalString = rString+aString+fString;
                        console.log(message.author.username+"#"+message.author.discriminator+" "+finalString);
                        finalString = discString+discAString+fString;
                        message.channel.send(finalString);
                        registeredName.forEach((item, i) => {
                          username.push(item);
                        });
                        registeredCID.forEach((item, i) => {
                          cID.push(item);
                          if(!item){
                            registeredCID[i] = "null";
                          }
                        });

                        if(registeredCID.length > 0){
                          const sql = "UPDATE discord SET cID = '"+JSON.stringify(cID)+"', username = '"+JSON.stringify(username)+"' WHERE discID = "+message.author.id+";";
                          con.query(sql);

                          var password = CryptoJS.AES.encrypt(message.author.id, message.author.id).toString();
                          for(var xx = 0; xx < registeredCID.length; xx++){
                            const sql = "INSERT INTO `players` ( `cID`, `username`, `password`, `email`, discID, `avatar`, `verify`, `signup`) VALUES ( "+registeredCID[xx]+", '"+registeredName[xx]+"', '"+password+"', 'Discord', "+message.author.id+", '"+registeredAvi[xx]+"', 1, 1);";
                            con.query(sql);
                          }
                        }

                      }
                      ii++;
                    }else{
                      message.channel.send("Unfortunately we could not find "+user.data.profile.handle+"'s bio.");
                      console.log(message.author.username+"#"+message.author.discriminator+" failed to register "+user.data.profile.handle+" (No Bio)");
                    }
                  }else{
                    if(tries != 1){
                      console.log("Failed to find "+name+", retrying.");
                      tries++;
                      retry(name);
                    }else{
                      argz.remove(name);
                      setTimeout(() => {
                        message.channel.send("Could not find Citizen: "+name);
                      }, 3000);
                    }
                  }
                }
              });
            })
            req.on('error', error => {
              console.error(error)
            });
            req.end();
          }
        }
      }else{
        firstRegister();
      }
    });
  }


  function firstRegister(){
    return new Promise(callback =>{
      const registerP1 = "You're almost done! \nPut this key into your account's bio: `"+CryptoJS.AES.encrypt("mt.co", message.author.id).toString()+"` \n\nThen type !register and the RSI Handle(s) \nIE: !register JamesDusky0 JamesDusky1";
      const sql = "SELECT cID FROM discord WHERE discID = "+message.author.id+";";
      con.query(sql, function (err, result, fields) {
        if(err) throw err;
        if(result.length == 0){
          console.log(message.author.username+"#"+message.author.discriminator+" Registered!");
          const sql = "INSERT INTO `discord` ( discUser, discID ) VALUES ( '"+message.author.tag+"' ,"+message.author.id+");";
          con.query(sql, function (err, result, fields){
            if(err) throw err;
            client.users.fetch(message.author.id).then((user) =>{
              user.send("You can now login to MobiTracker.co using your Registered Handles."+"\n\nYour temporary password to MobiTracker is ```"+message.author.id+"```");
            });
            callback();
          });
        }
      });
      message.channel.send(registerP1);
    })
  }
}

function toggleAlerts(message, args){
  if(args.length>1){
    return message.author.send('Too many arguments.');
  }else if(args.length == 0){
    const sql = "SELECT contracts, applicants, reviews FROM discordAlerts WHERE discordUser->'$.id' = '"+message.author.id+"'";
    con.query(sql, function (err, result, fields) {
      if(err) throw err;

      if(result.length > 0){
        var string = '';
        if(result[0].paused == 1){
          return message.author.send('Your Alerts are paused!');
        }else{
          if(result[0].contracts != -1){
            result[0].contracts = 'ON';
          }else{
            result[0].contracts = 'OFF';
          }
          if(result[0].applicants != -1){
            result[0].applicants = 'ON';
          }else{
            result[0].applicants = 'OFF';
          }
          if(result[0].reviews != -1){
            result[0].reviews = 'ON';
          }else{
            result[0].reviews = 'OFF';
          }
          return message.author.send('Your Alert Policy: \nContracts: '+result[0].contracts+' \nApplicants: '+result[0].applicants+' \nReviews: '+result[0].reviews);
        }
      }else{
        message.author.send("This command is used for toggling on and off your discord alerts of MobiTracker.co \nIf you'd like to received discord alerts sign up at https://mobitracker.co");
      }
    });
  }
  const sql = "SELECT contracts, applicants, reviews FROM discordAlerts WHERE discordUser->'$.id' = '"+message.author.id+"'";
  con.query(sql, function (err, result, fields) {
    if(err) throw err;

    if(result.length > 0 && args.length > 0){
      args[0] = args[0].toString().toLowerCase();
      if(args[0] == "off"){
        const sql = "UPDATE discordAlerts SET userPause = 1 WHERE discordUser->'$.id' = '"+message.author.id+"'";
        con.query(sql, function (err, result, fields) {
          if(err) throw err;

          console.log(message.author.tag+" turned off their alerts");
          message.author.send("Paused Alerts.");
        });
      }else if(args[0] == "on"){
        const sql = "UPDATE discordAlerts SET userPause = 0 WHERE discordUser->'$.id' = '"+message.author.id+"'";
        con.query(sql, function (err, result, fields) {
          if(err) throw err;

          console.log(message.author.tag+" turned on their alerts");
          message.author.send("Resumed Alerts.");
        });
      }
    }
  });
}

function showContracts(message, args){
  const pp = 4;
  if(!args.length){
    var p = 0;
  }else if(args.length == 1 && args[0] > 0){
    var p = args[0]-1;
  }else{
    return message.channel.send('Invalid Arguments.');
  }
  var mp;
  var limit;
  var sql = "SELECT id FROM contracts WHERE faction = 0";
  con.query(sql, function (err, result, fields) {
    if(err) throw err;

    mp = Math.ceil(result.length/pp);
    if(p > mp){
      p = mp;
    }
    if(p*pp == 0){
      limit = 'LIMIT 4';
    }else{
      limit = 'LIMIT 4, '+(p*pp-1);
    }
    var sql = "SELECT u_creator, careertype, price, target, faction, type, unsecure, escrow->'$.ESCROW' AS escrow, created_at FROM contracts WHERE faction = 0 AND completed = 0 AND markComplete = 0 AND escrow->'$.ACTIVE' = true ORDER BY id DESC "+limit+";";
    con.query(sql, function (err, result, fields) {
      if(err) throw err;

      var newCreator = [], newPrice = [], newEscrow = [], newDesc = [], spacer, field = [];
      for(var x = 0; x<result.length; x++){
        if(result[x].type == 'R'){
          if(result[x].careertype == 'Scouting'){
            result[x].careertype = 'Looking for a Scout';

          }else if(result[x].careertype == 'Delivery'){
            result[x].careertype = 'Looking for a Courier';

          }else if(result[x].careertype == 'Racing'){
            result[x].careertype = 'Looking to Race';

          }else if(result[x].careertype == 'Medical'){
            result[x].careertype = 'Looking for Medical Services';

          }else if(result[x].careertype == 'Security'){
            result[x].careertype = 'Looking for Security Services';

          }else if(result[x].careertype == 'Charting Regular'){
            result[x].careertype = 'Looking for a Charter';

          }else if(result[x].careertype == 'Charting Luxury'){
            result[x].careertype = 'Looking for a Luxurious Charter';

          }
        }else if(result[x].type == 'O'){
          if(result[x].careertype == 'Scouting'){
            result[x].careertype = 'Scout for Hire';

          }else if(result[x].careertype == 'Delivery'){
            result[x].careertype = 'Courier for Hire';

          }else if(result[x].careertype == 'Racing'){
            result[x].careertype = 'Racer for Hire';

          }else if(result[x].careertype == 'Medical'){
            result[x].careertype = 'Medical Services for Hire';

          }else if(result[x].careertype == 'Security'){
            result[x].careertype = 'Security Services for Hire';

          }else if(result[x].careertype == 'Charting Regular'){
            result[x].careertype = 'Regular Charter for Hire';

          }else if(result[x].careertype == 'Charting Luxury'){
            result[x].careertype = 'Luxurious Charter for Hire';

          }
        }
        result[x].unsecure = decodeEntities(result[x].unsecure);
        result[x].unsecure = truncate(result[x].unsecure, 10);
        result[x].price = result[x].price+' aUEC';
        if(result[x].escrow == 1){
          result[x].escrow = "Active";
        }else{
          result[x].escrow = "Inactive";
        }
        newCreator[x] = { name: result[x].u_creator, value: result[x].careertype, inline: true };
        newPrice[x] = { name: 'Price', value: numberWithCommas(result[x].price), inline: true };
        newEscrow[x] = { name: 'Escrow', value:result[x].escrow, inline:true };
        newDesc[x] = { name: 'Description', value:result[x].unsecure, inline:true };
        spacer = { name: '\u200B', value: '\u200B' };
      }
      p++;
      var embed = new MessageEmbed()
        .setColor(0x44a4dc)
        .setAuthor('MobiTracker Contracts', 'https://mobitracker.co/android-chrome-512x512.png', 'https://mobitracker.co/contracts')
        .setTitle('Page '+p+' of '+mp)
        .setFooter('Contracts - Mobitracker.co');
      for(var x = 0; x < result.length; x++){
        embed.addFields(newCreator[x]);
        embed.addFields(newPrice[x]);
        embed.addFields(newEscrow[x]);
        embed.addFields(newDesc[x]);
        if(x != result.length-1){
          embed.addFields(spacer);
        }
      }
      message.channel.send(embed);
    });
  });
}

function xp(rep){
  rep = parseInt(rep);
  if(rep < 0){
    if(rep < -5){
      return "Dangerous";
    }else if (rep < 0) {
      return "Sketchy";
    }
  }else{
    if(rep == 0){
      return "Newbie";
    }else if (rep <= 30) {
      return "Experienced";
    }else if (rep <= 100) {
      return "Reliable";
    }
  }
}

//EVENTS
const program = async () => {
  const instance = new MySQLEvents(con, {
    startAtEnd: true,
    serverId:2,
    excludedSchemas: {
      mysql: true,
    },
  });
  await instance.start();

  instance.addTrigger({
    name: 'Alert',
    expression: '*',
    statement: MySQLEvents.STATEMENTS.ALL,
    onEvent: (event) => {
      if(event.table == 'discordAlerts' && (event.affectedColumns[0] === 'contracts' || event.affectedColumns[0] === 'applicants' || event.affectedColumns[0] === 'reviews' || event.affectedColumns[0] === 'escrow')){
        const alert = event.affectedRows[0].after;
        const after = alert;
        const before = event.affectedRows[0].before;
        const show = { contracts:JSON.parse(alert.contracts), applications:JSON.parse(alert.applicants), escrow:JSON.parse(alert.escrow), reviews:JSON.parse(alert.reviews) };
        var notiCount = 0;
        for(var i = 0; i < Object.keys(show).length; i++){
          notiCount = show[Object.keys(show)[i]].count + notiCount;
        }

        const col = event.affectedColumns[0];
        const user = event.affectedRows[0].after.discordUser;
        const id = JSON.parse(user);
        var embed = new MessageEmbed()
          .setColor(0x25a6dd)
          .setAuthor(alert.username, 'https://mobitracker.co/android-chrome-512x512.png', 'https://mobitracker.co/'+alert.username)
          .setTitle(notiCount+" Notifications")
          .setFooter(alert.username+' - Mobitracker.co')
          .setTimestamp();
        if(!alert.pause && !alert.userPause){
          var index = Object.keys(show);
          for(var i = 0; i < Object.keys(show).length; i++){
            if(show[index[i]].active){
              var title = index[i].charAt(0).toUpperCase() + index[i].slice(1);
              if(show[index[i]].count>0){
                var previous = "", latest = "";
                if(i == 1){

                  if(show[index[i]].myApplications.events.length>0){
                    if(show[index[i]].myApplications.events.length>1){
                      previous = "\n\nPrevious - "+show[index[i]].myApplications.events[(show[index[i]].myApplications.events.length-2)];
                    }else{
                      previous = "";
                    }
                    latest = "Latest - "+show[index[i]].myApplications.events[(show[index[i]].myApplications.events.length-1)]

                    embed.addFields({ name: "My Applications - "+show[index[i]].myApplications.events.length, value: latest+previous });
                    embed.addFields({ name: '\u200B', value: '\u200B' });
                  }else{
                    embed.addFields({ name: "My Applications - "+show[index[i]].myApplications.events.length, value: "No Notifications" });
                    embed.addFields({ name: '\u200B', value: '\u200B' });
                  }
                  if(show[index[i]].myContracts.events.length>0){
                    if(show[index[i]].myContracts.events.length>1){
                      previous = "\n\nPrevious - "+show[index[i]].myContracts.events[(show[index[i]].myContracts.events.length-2)];
                    }else{
                      previous = "";
                    }
                    latest = "Latest - "+show[index[i]].myContracts.events[(show[index[i]].myContracts.events.length-1)];
                    embed.addFields({ name: "My Contracts - "+show[index[i]].myContracts.events.length, value: latest+previous });
                  }else{
                    embed.addFields({ name: "My Contracts - "+show[index[i]].myContracts.events.length, value: "No Notifications"});
                  }
                }else{
                  if(show[index[i]].count>1){
                    previous = "\n\nPrevious - "+show[index[i]].events[(show[index[i]].count-2)];
                  }
                  latest = "Latest - "+show[index[i]].events[(show[index[i]].count-1)];
                  embed.addFields({ name: title+" - "+show[index[i]].count, value: latest+previous });
                }
              }else{
                embed.addFields({ name: title+" - "+show[index[i]].count, value:"No Notifications" });
              }
              if(i != 3){
                embed.addFields({ name: '\u200B', value: '\u200B' });
              }
            }
          }
          if(notiCount > 0){
            client.users.fetch(id.id).then((user) =>{
              user.send(embed);
            });
          }
        }
      }
    },
  });
  instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
  instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
};
program().then(() => console.log('Waiting for database events...')).catch(console.error);

client.login(config.Key);
