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
const wsClient = new WebSocket("wss://mobitracker.co:8000");
const schedule = require('node-schedule');
require('console-stamp')(console, 'HH:MM:ss.l');
var jwt = require('jsonwebtoken');
var discordClients = [];
var position = [];
var update = [];
var updateBool = true;
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime:333
});
const jobQueue = new Bottleneck();
const queueCounts = jobQueue.counts();

jobQueue.on("executing", function(info){
  console.log(jobQueue.jobs("EXECUTING").join(", ")+" executing");
});

limiter.on("queued", function(info){
  console.log(limiter.jobs("QUEUED").join(", ")+" in Queue");
  position.push({ id:info.options.id, priority:info.options.priority, message:info.args[2], msg:info.args[4], len:info[0].length });
  position.sort((a, b) => {
      return a.priority - b.priority;
  });
  position.forEach((e, iii) => {
    console.log(e.id+" | "+e.priority+" | "+iii+" in Queue");
    if(iii == 0){
      e.msg.edit("Running");
    }else{
      e.msg.edit(iii+" in Queue");
    }
  });
});

limiter.on("executing", function(info){
  position[0].msg.edit("Running");
  console.log(position[0].id+' running');
});

limiter.on("done", function(info){
  console.log(position[0].id+" job finished");
  position[0].message.channel.send("Finished "+info[0].length+" searches");
  position.shift();
  for(var ii = 0; ii < position.length; ii++){
    position[ii].msg.edit(ii+" in Queue");
  }
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
  var msg = await message.channel.send("Preparing your request");
  jobQueue.schedule( { id:message.author.username }, lookUp, args.length, message, args, msg)
  .catch((error) => {
    if (error instanceof Bottleneck.BottleneckError) {
      msg.edit("You must wait for your current job to finish.");
    }
  });
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
  wsClient.onopen = function(){
    wsClient.send(JSON.stringify(msg));
    console.log("Connected to Event Server");
    heartbeat();
  }

  wsClient.onmessage = function(response){
    response = JSON.parse(response.data);
    console.log(response.event);
  }

  wsClient.onclose = function(){
    console.log("Reconnecting to Event Server");
    setInterval(socket, 3000);
  };

  wsClient.onerror = function(){
    setTimeout(socket, 3000);
  };
}


function heartbeat() {
  if (!wsClient) return;
  if (wsClient.readyState !== 1) return;
  wsClient.send(JSON.stringify({type:"ping"}));
  setTimeout(heartbeat, 3000);
}

socket();

var trueLog = console.log;
console.log = function(msg) {
    fs.appendFile('/home/ubuntu/logs/bot.log', new Date().toLocaleTimeString('en-US')+" - "+msg+'\n', function(err) { if(err) {
        return trueLog(err);
      }
    });
    trueLog(msg);
}

var con = mysql.createPool({
  host: config.MysqlHost,
  user: config.MysqlUsername,
  password: config.MysqlPassword,
  database: config.MysqlDatabase
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

async function lookUp(count, message, args, msg){
  var args = args;
  var keys = [];
  var percent, nodupe = 0;
  message.author.prio = await getPrio(message.author.id);
  for(var i = 0; i < args.length; i++){
    await getKey(args.length).then(async (key) => {
      keys.push(key);
      percent = Math.round((i/args.length)*100);
      if(percent%5 == 0 && percent != nodupe){
        nodupe = percent;
        msg.edit("Preparing your request - "+percent+"%");
      }
    });
  }
  console.log(message.author.username+" Priority: "+message.author.prio);
  const query = async function(args, keys, message, i){
    for(var i = 0; i < args.length; i++){
      args[i] = args[i].replace(/[^\-a-zA-Z0-9]/g, '_');
      if(message.author.id != "751252617451143219"){
        if(message.channel.type == "text"){
          console.log(message.author.username+'#'+message.author.discriminator+' searched for '+args[i]+' in the '+message.guild.name+' server');
        }else{
          console.log(message.author.username+'#'+message.author.discriminator+' searched for '+args[i]+' in '+message.channel.type+'s');
        }
      }
      message.channel.send(await queryApi(args[i], keys[i]));
    }
    return;
  }
  limiter.schedule({ priority:message.author.prio, id:message.author.username }, query, args, keys, message, i, msg);
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
      path: '/'+apiKey+'/v1/auto/user/'+escape(args),
      method: 'GET'
    }
    const req = https.request(options, res =>{
      var body = "";
      res.on('data', d => {
        body += d;
      })
      res.on('error', error => {
        console.log(error);
        console.log("Encountered an error, Retrying user "+args);
      })
      res.on('end', function(){
        console.log("searched "+args);
        try{
          var user = JSON.parse(body);
          if(user.data == null){
            console.log(args+" returned null, retrying");
            setTimeout(() => {
              queryApi(args, apiKey);
            }, 1000);
          }
        }catch(err){
          var result = "Encountered an error, User: "+args;
          console.log(result);
          promiseSearch(result);
        };
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
              rating = "No Reviews. \n[Login](https://mobitracker.co/login) to leave them a review.";
            }else{
              if(result[0].rating == -1){
                rating = "No Reviews. \n[Login](https://mobitracker.co/login) to leave them a review.";
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
            promiseSearch(embed);
          });
        }else{
          var result = "Could not find "+`${args}`;
          //console.log(result);
          promiseSearch(result);
        }
      })
    })
    req.end()
  });
}

function cachePlayer(user){
  //console.log(con.escape(user.profile.bio));
  var update = false;
  var eventUpdate = new Array();
  var check = { cID:0,
                username:'',
                badge: { src:'', title:'' },
                organization: [],
                avatar: ''
              };
  check.cID = parseInt(user.profile.id.substring(1));
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
    sql = "SELECT cID, username, badge, organization, avatar FROM `CACHE players` WHERE cID = "+user.profile.id.substring(1)+";";
  }else{
    check.cID = 0;
    sql = "SELECT cID, username, badge, organization, avatar FROM `CACHE players` WHERE username = '"+user.profile.handle+"';";
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
        eventUpdate.push("Username Changed");
      }else if (data.badge.title != check.badge.title) {
        update = true;
        eventUpdate.push("Badge Changed");
      }else if (data.avatar != check.avatar) {
        update = true;
        eventUpdate.push("Avatar Changed");
      }
    }else{
      check.badge = JSON.stringify(check.badge);
      check.organization = JSON.stringify(Object.assign({}, check.organization));
      const sql = "INSERT INTO `CACHE players` (event, cID, username, badge, organization, avatar) VALUES ('First Entry', "+check.cID+", '"+check.username+"', '"+check.badge+"', '"+check.organization+"', '"+check.avatar+"' );";
      con.query(sql, function (err, result, fields) {
        if(err){
          console.log(err);
        }
      });
    }
    if(update){
      check.badge = JSON.stringify(check.badge);
      check.organization = JSON.stringify(Object.assign({}, check.organization));
      var eventString = eventUpdate.join(", ");
      const sql = "INSERT INTO `CACHE players` (event, cID, username, badge, organization, avatar) VALUES ('"+eventString+"', "+check.cID+", '"+check.username+"', '"+check.badge+"', '"+check.organization+"', '"+check.avatar+"');";
      con.query(sql, function (err, result, fields) {
        if(err) throw err;
      });
    }
  });
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
    if(args.length > 1){
      addQueue(message, args);
    }else{
      var msg = await message.channel.send("Preparing your request");
      lookUp(args.length, message, args, msg);
    }
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

  if(command == 'help'){
    message.channel.send("MobiTracker's Discord bot is very simple to use! \n\n!help - Bring up this help message \n\n!search USERNAME - Find any user in the verse by their ingame name quickly and displaying all the information you'd find online at https://mobitracker.co \n\n !contracts PAGENUMBER - Search through MobiTrackers Contracts by the page number and See what people are doing! \n\n!auth - The command to authorize and edit your alert policies! \nGet your auth token at https://mobitracker.co/discord \n\n!alerts on/off - Pause and Resume your alert policy!");
  }

  /*
  if(command == 'auth'){
    if(!args.length){
      return message.channel.send('Sign in at https://mobitracker.co/login and click the button at the top that says "Discord Bot". \nThen and copy the text provided and paste it here.');
    }else if(args.length>1){
      return message.channel.send('Too many arguments.');
    }
    jwt.verify(`${args}`, config.Secret, { algorithm: 'HS265' }, function (err, decoded){
      if(err){
        if(err.message === 'jwt expired'){
          message.author.send('This Token has expired!');
        }else{
          message.author.send('Invalid Token!');
        }
      }else{
        if(decoded.cid != "" && decoded.username != ""){
          const authUser = message.author;
          delete decoded.exp;
          decoded.update = false;
          const token = jwt.sign({ mtUser:decoded, discordUser: authUser}, config.Secret, { algorithm: 'HS256' }, { 'iat':Math.floor(Date.now()/1000) });
          const msg = {
            type:"authDiscord",
            token: token
          };
          const sql = "SELECT username FROM players WHERE username = '"+decoded.username+"' AND cID = "+decoded.cid;
          con.query(sql, function (err, result, fields){
            if (err) throw err;
            if(result.length > 0){
              const sql = "SELECT contracts->'$.active' AS contracts, applicants->'$.active' AS applicants, reviews->'$.active' AS reviews FROM discordAlerts WHERE username = '"+decoded.username+"' AND cID = "+decoded.cid;
              con.query(sql, function (err, result, fields) {
                if (err) throw err;
                if(result.length > 0){
                  if(decoded.contracts === result[0].contracts && decoded.applicants === result[0].applicants && decoded.reviews === result[0].reviews ){
                    message.author.send('Your policies are the same. \nContracts: '+result[0].contracts+'\nApplicants & Escrow: '+result[0].applicants+'\nReviews: '+result[0].reviews);
                  }else{
                    decoded.update = true;
                    const token = jwt.sign({ mtUser:decoded, discordUser: authUser}, config.Secret, { algorithm: 'HS256' }, { 'iat':Math.floor(Date.now()/1000) });
                    const msg = {
                      type:"authDiscord",
                      token: token
                    };
                    wsClient.send(JSON.stringify(msg));
                    message.author.send('Updated your alert policies!');
                  }
                }else{
                  wsClient.send(JSON.stringify(msg));
                  var span = "";
                  if(decoded.contracts == 0 && decoded.reviews != 0){
                    span = " for contract alerts.";
                  }else if(decoded.contracts != 0 && decoded.reviews == 0){
                    span = " for review alerts.";
                  }else{
                    span = " for contracts and review alerts.";
                  }
                  message.author.send('Your discord is now linked with '+decoded.username+''+span+' \nhttps://mobitracker.co/'+decoded.username+' \nRemember to share a server containing this bot to keep getting alerts! \nYou may toggle alerts with !alerts.');
                }
              });
            }else{
              message.author.send('You must sign up at https://mobitracker.co/register To get discord alerts.');
            }
          });
        }else{
          message.author.send('The token was invalid. Please copy the provided token from https://mobitracker.co/auth');
        }
      }
    });
  }
  */
  if (!message.content.startsWith(`${prefix}`)) return;
});

async function registerUser(message, argz){
  if(argz.length > 0){
    await getKey().then((key) => {
      linkRSI(key);
    });
  }else{
    firstRegister();
  }
  async function linkRSI(key){
    const sql = "SELECT cID, username FROM discord WHERE discID = "+message.author.id;
    con.query(sql, function (err, result, fields) {
      if(err) throw err;

      if(result.length == 0){
        var args = [];
        for(var y = 0; y < argz.length; y++){
          args.push(argz[y].toLowerCase());
        }
        var args = args.filter((c, index) => {
          return args.indexOf(c) === index;
        });
        console.log(message.author.username+"#"+message.author.discriminator+" requested to Register "+args.join(", "));
        var registeredNames = [];
        var registeredCID = [];
        var failedNames = [];
        var ii = 0;
        var tries = 0;
        for(var i = 0; i < args.length; i++){
          const options = {
            hostname: 'api.starcitizen-api.com',
            port: 443,
            path: '/'+key+'/v1/live/user/'+escape(args[i]),
            method: 'GET'
          }
          retry(args[i]);
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
                if(Object.keys(user.data).length > 0){
                  if(user.data.profile.bio){
                    const bio = user.data.profile.bio.split(/\s+/);
                    if(user.data.profile.id != "n/a"){
                      user.data.profile.id.substring(1);
                    }
                    for(var x = 0; x < bio.length; x++){
                      var encrypted = bio[x];
                      try{
                        var result = CryptoJS.AES.decrypt(encrypted, message.author.id).toString(CryptoJS.enc.Utf8);
                      }catch{
                      }
                      if(result == "mt.co"){
                        if(!registeredNames.includes(user.data.profile.handle)){
                          registeredNames.push(user.data.profile.handle);
                          registeredCID.push(user.data.profile.id);
                        }
                        x = bio.length
                      }else{
                        if(x == bio.length-1){
                          failedNames.push(user.data.profile.handle);
                        }
                      }
                    }
                    if(ii == args.length-1){
                      var rString = "", fString = "", drString = "", dfString = "";
                      if(registeredNames.length > 0){
                        rString = " | Registered: "+registeredNames.join(", ");
                        drString = "Registered: "+registeredNames.join(", ")+" ";
                      }
                      if(failedNames.length > 0){
                        fString = " | Failed: "+failedNames.join(", ")+" (No Token/Wrong Token)";
                        dfString = dfString+"Failed: "+failedNames.join(", ")+" (No Token/Wrong Token)";
                      }
                      var finalString = rString+fString;
                      console.log(message.author.username+"#"+message.author.discriminator+finalString);
                      if(drString && !dfString){
                        message.channel.send(drString);
                      }else if (!drString && drString) {
                        message.channel.send(dfString);
                      }else{
                        message.channel.send(drString+"\n"+dfString);
                      }

                      var password = CryptoJS.AES.encrypt("mt.co", message.author.id).toString();
                      password = password.substring(password.length/2, password.length);

                      const sql = "UPDATE discord SET cID = '"+JSON.stringify(registeredCID)+"', username = '"+JSON.stringify(registeredNames)+"', password = '"+password+"';";
                      con.query(sql, function (err, result, fields) {
                        if(err) throw err;
                      });

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
                    args.remove(name);
                    setTimeout(() => {
                      message.channel.send("Could not find Citizen: "+name);
                    }, 3000);
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
      }else if(result.length > 0){
        addRSI(result, key);
      }else{
        firstRegister();
      }
    });
  }

  function addRSI(result, key){
    if(result[0].username){
      var username = JSON.parse(result[0].username);
    }else{
      var username = [];
    }
    var registeredCID = [];
    var failedNames = [];
    var alreadyLinked = [];
    var ii = 0;
    var tries = 0;
    if(result[0].username){
      for(var i = 0; i < argz.length; i++){
        if(username.includes(argz[i])){
          alreadyLinked.push(argz[i]);
          username.splice(username.indexOf(argz[i]), 1);
          argz.splice(i, 1);
        }
      }
    }
    if(argz.length == 0){
      message.channel.send("Failed: "+alreadyLinked.join(", ")+" (Already Registered)");
      return;
    }
    for(var i = 0; i < argz.length; i++){
      const options = {
        hostname: 'api.starcitizen-api.com',
        port: 443,
        path: '/'+key+'/v1/live/user/'+escape(argz[i]),
        method: 'GET'
      }

      retry(argz[i]);
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
            if(Object.keys(user.data).length > 0){
              if(user.data.profile.bio){
                const bio = user.data.profile.bio.split(/\s+/);
                if(user.data.profile.id != "n/a"){
                  user.data.profile.id.substring(1);
                }
                for(var x = 0; x < bio.length; x++){
                  var encrypted = bio[x];
                  try{
                    var crypto = CryptoJS.AES.decrypt(encrypted, message.author.id).toString(CryptoJS.enc.Utf8);
                  }catch{
                  }
                  if(crypto == "mt.co"){
                    if(username == null){
                      username.push(user.data.profile.handle);
                      registeredCID.push(user.data.profile.id);
                    }else{
                      if(!username.includes(user.data.profile.handle)){
                        username.push(user.data.profile.handle);
                        registeredCID.push(user.data.profile.id);
                      }
                    }
                    x = bio.length;
                  }else{
                    if(x == bio.length-1){
                      failedNames.push(user.data.profile.handle);
                    }
                  }
                }
                if(ii == argz.length-1){
                  var rString = "", fString = "", aString = "";
                  if(username.length > 0){
                    rString = "Registered: "+username.join(", ")+" ";
                  }
                  if(alreadyLinked.length > 0){
                    aString = "Already Linked: "+alreadyLinked.join(", ")+" ";
                  }
                  if(failedNames.length > 0){
                    fString = "Failed: "+failedNames.join(", ")+" (No Token/Wrong Token)";
                  }
                  var finalString = rString+aString+fString;
                  console.log(message.author.username+"#"+message.author.discriminator+" "+finalString);
                  message.channel.send(finalString);

                  var password = CryptoJS.AES.encrypt("mt.co", message.author.id).toString();
                  password = password.substring(password.length/2, password.length);

                  if(registeredCID.length > 0){
                    const sql = "UPDATE discord SET cID = '"+JSON.stringify(registeredCID)+"', username = '"+JSON.stringify(username)+"' WHERE discID = "+message.author.id+";";
                    con.query(sql);
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
          });
        })
        req.on('error', error => {
          console.error(error)
        });
        req.end();
      }
    }
  }

  function firstRegister(){
    const registerP1 = "You're almost done! \nPut this key into your account's bio: `"+CryptoJS.AES.encrypt("mt.co", message.author.id).toString()+"` \n\nThen type !register and the RSI Handle(s) \nIE: !register JamesDusky0 JamesDusky1";
    const sql = "SELECT cID FROM discord WHERE discID = "+message.author.id;
    con.query(sql, function (err, result, fields) {
      if(err) throw err;
      if(result.length == 0){
        console.log(message.author.username+"#"+message.author.discriminator+" Registered!");
        var password = CryptoJS.AES.encrypt("mt.co", message.author.id).toString();
        password = password.slice(0, password.length/2);
        const sql = "INSERT INTO `discord` (discID, password) VALUES ("+message.author.id+", '"+password+"');";
        con.query(sql, function (err, result, fields) {
          if(err) throw err;
          client.users.fetch(message.author.id).then((user) =>{
            user.send("You can now login to MobiTracker.co using your Registered RSI Handles."+"\n\nYour password to MobiTracker is "+password);
          });
        });
      }
    });
    message.channel.send(registerP1);
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
