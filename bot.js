'use strict';
const { Client, MessageEmbed } = require('discord.js');
const config  = require('./config');
const prefix = '!';
const MySQLEvents = require('@rodrigogs/mysql-events');
const fs = require('fs');
const https = require('https');
const mysql = require('mysql');
const WebSocket = require('ws');
const client = new Client();
var wsClient;
var jwt = require('jsonwebtoken');
var discordClients = [];

const botToken = jwt.sign({ mtUser:{username:'mtcobot', cid: '0000001'} }, config.Secret, { algorithm: 'HS256' }, { 'iat':Math.floor(Date.now()/1000) });
const msg = {
  type:"bot",
  token: botToken
};

function connectEvent(){
  try{
    wsClient = new WebSocket('wss://mobitracker.co:8000');

    wsClient.on('open', function(){
      wsClient.send(JSON.stringify(msg));
      console.log("Connected to Event Server");
    });

    wsClient.on('message', function(response){
      response = JSON.parse(response);
      console.log(response.event);
    });

    wsClient.on('close', function(){
      clearTimeout(this.pingTimeout);
    })

    wsClient.on('error', function(err){
      console.log('Failed to connect to Event Server');
      reconnect();
    });
  }catch(e){
    reconnect();
  }
}

connectEvent();

function reconnect(){
  setTimeout(() => {
    connectEvent();
  }, 10000);
}

function heartbeat(){
  clearTimeout(this.pingTimeout);
  this.pingTimeout = setTimeout(() => {
    reconnect();
  }, 30000 + 1000);
}

var trueLog = console.log;
console.log = function(msg) {
    fs.appendFile('/home/ubuntu/logs/bot.log', msg+'\n', function(err) {
      if(err) {
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
  if(aff.length > 0){
    for (var i = 0; i < aff.length; i++) {
      display = display+aff[i].rank+' in '+'['+aff[i].name+']'+'(https://robertsspaceindustries.com/orgs/'+aff[i].sid+')'+'\n';
    }
    return display;
  }else{
    return "None";
  }
}

var truncate = function (elem, limit) {
	if (!elem || !limit) return;
	var content = elem.trim();
	content = content.split(' ').slice(0, limit);
	content = content.join(' ');
	elem = content;
  return elem;
};

Object.size = function(obj) {
  var size = 0, key;
  for (key in obj) {
      if (obj.hasOwnProperty(key)) size++;
  }
  return size;
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

client.on('message', message => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'search'){
  	if (!args.length){
  		return message.channel.send(`You didnt provide a username.`);
  	}else if (args.length > 1) return message.channel.send(`Too many arguments.`);
    const options = {
      hostname: 'api.starcitizen-api.com',
      port: 443,
      path: '/c13b1badf9ccd433c90b4160c7664107/v1/auto/user/'+`${args}`,
      method: 'GET'
    }
    const req = https.request(options, res => {
      console.log('Looked up '+`${args}`);
      res.on('data', d => {
        const user = JSON.parse(d);
        if(Object.size(user.data) > 0){
          if(Object.size(user.data.organization) > 1){
            user.data.organization.name = user.data.organization.rank+' in '+'['+user.data.organization.name+'](https://robertsspaceindustries.com/orgs/'+user.data.organization.sid+')';
          }else if (user.data.organization.name == ""){
            user.data.organization.name = "REDACTED";
          }else{
            user.data.organization.name = "None";
          }
          var cID = '';
          if(user.data.profile.id != 'n/a'){
            cID = 'AND cID ='+user.data.profile.id.substring(1);
          }
          const sql = "SELECT avgRating as rating, reviewed_count as count FROM players WHERE username = '"+user.data.profile.handle+"'"+cID;
          con.query(sql, function (err, result, fields) {
            if (err) throw err;
            var rating = "";
            if(result.length == 0){
              rating = "No Reviews. \n[Login](https://mobitracker.co/login) to leave them a review.";
            }else{
              if(result[0].rating == -1){
                rating = "No Reviews. \n[Login](https://mobitracker.co/login) to leave them a review.";
              }else{
                rating = result[0].rating+"/5 "+"("+result[0].count+")";
              }
            }
            var embed = new MessageEmbed()
              .setColor(0x25a6dd)
              .setAuthor(user.data.profile.handle+user.data.profile.id, user.data.profile.image, "https://mobitracker.co/"+user.data.profile.handle)
              .setDescription("AKA "+user.data.profile.display)
              .setThumbnail(user.data.profile.image)
              .addFields(
                { name: 'Badge', value: user.data.profile.badge, inline: true},
                { name: 'Mobitracker Rating', value: rating, inline: true},
                { name: 'Main Organization', value: user.data.organization.name },
                { name: 'Affiliated Organizations', value: affiliations(user.data.affiliation)}
               )
               .setFooter(user.data.profile.handle+' - Mobitracker.co', 'https://mobitracker.co/android-chrome-512x512.png');
            message.channel.send(embed);
          });
        }else{
          message.channel.send(`That user doesnt exist.`);
        }
      })
    })

    req.on('error', error => {
      console.error(error)
    })

    req.end()

  }
  if(command == 'auth'){
    if(!args.length){
      return message.channel.send('Sign in at https://mobitracker.co/login and click the button that says "Authenticate with Discord". \nThen and copy the text provided and paste it here.');
    }else if(args.length>1){
      return message.channel.send('Too many arguments.');
    }
    jwt.verify(`${args}`, config.Secret, { algorithm: 'HS265' }, function (err, decoded){
      if(err){
        console.log(err);
        console.log(`${args}`);
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
              const sql = "SELECT contracts, applicants, reviews FROM discordAlerts WHERE username = '"+decoded.username+"' AND cID = "+decoded.cid;
              con.query(sql, function (err, result, fields) {
                if (err) throw err;
                if(result.length > 0){
                  if(decoded.contracts.toString() == result[0].contracts && decoded.applicants.toString() == result[0].applicants && decoded.reviews.toString() == result[0].reviews ){
                    message.author.send('Your policies are the same.');
                    console.log(decoded.username+':'+decoded.cid+' gave existing policies');
                  }else{
                    decoded.update = true;
                    const token = jwt.sign({ mtUser:decoded, discordUser: authUser}, config.Secret, { algorithm: 'HS256' }, { 'iat':Math.floor(Date.now()/1000) });
                    const msg = {
                      type:"authDiscord",
                      token: token
                    };
                    wsClient.send(JSON.stringify(msg));
                    message.author.send('Updated your alert policies!');
                    console.log(decoded.username+':'+decoded.cid+' updated their alert policies');
                  }
                }else{
                  wsClient.send(JSON.stringify(msg));
                  var span = "";
                  if(decoded.contracts == 0 && decoded.reviews != 0){
                    span = " for contract alerts.";
                  }else if(decoded.contracts != 0 && decoded.reviews == 0){
                    span = " for review alerts.";
                  }else{
                    span = " for contract and review alerts.";
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
  if(command == 'contracts'){
    const pp = 4;
    if(!args.length){
      var p = 0;
    }else if(args.length == 1 && args.length > 0){
      var p = args[0]-1;
    }else{
      return message.channel.send('Invalid Arguments.');
    }
    var mp;
    var limit;
    if(p*pp == 0){
      limit = 'LIMIT 4';
    }else{
      limit = 'LIMIT 4, '+p*pp;
    }
    var sql = "SELECT id FROM contracts WHERE faction = 0";
    con.query(sql, function (err, result, fields) {
      if(err) throw err;
      mp = result.length/pp;
      if(p > mp){
        p = mp;
      }
    });
    var sql = "SELECT u_creator, careertype, price, duration, target, faction, type, unsecure, created_at FROM contracts WHERE faction = 0  ORDER BY id DESC "+limit+";";
    con.query(sql, function (err, result, fields) {
      if(err) throw err;
      console.log(sql);
      if(result.length>0){
        for(var x = 0; x<result.length; x++){
          if(result[x].type == 'S'){
            if(result[x].careertype == 'Scouting'){
              result[x].careertype = 'Looking for a Scout';
            }else if(result[x].careertype == 'Delivery'){
              result[x].careertype = 'Need a Courier';
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
          }else if(result[x].type == 'P'){
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
          if(result[x].duration == 1){
            result[x].duration = '1 hour';
          }else{
            result[x].duration = result[x].duration+' hours';
          }
          result[x].unsecure = truncate(result[x].unsecure, 10);
        }
        p++;
        var embed = new MessageEmbed()
          .setColor(0x25a6dd)
          .setAuthor('MobiTracker Contracts', 'https://mobitracker.co/android-chrome-192x192.png', 'https://mobitracker.co/contracts')
          .setTitle('Page '+p+' of '+mp)
          .addFields(
            { name: result[pp-4].u_creator, value: result[pp-4].careertype, inline: true},
            { name: 'Price', value:result[pp-4].careertype, inline:true },
            { name: 'Expected Duration', value:result[pp-4].duration, inline:true },
            { name: 'Description', value:result[pp-4].unsecure, inline:true },

            { name: '\u200B', value: '\u200B' },

            { name: result[pp-3].u_creator, value: result[pp-3].careertype, inline: true},
            { name: 'Price', value:result[pp-3].careertype, inline:true },
            { name: 'Expected Duration', value:result[pp-3].duration, inline:true },
            { name: 'Description', value:result[pp-3].unsecure, inline:true },

            { name: '\u200B', value: '\u200B' },

            { name: result[pp-2].u_creator, value: result[pp-2].careertype, inline: true},
            { name: 'Price', value:result[pp-2].careertype, inline:true },
            { name: 'Expected Duration', value:result[pp-2].duration, inline:true },
            { name: 'Description', value:result[pp-2].unsecure, inline:true },

            { name: '\u200B', value: '\u200B' },

            { name: result[pp-1].u_creator, value: result[pp-1].careertype, inline: true},
            { name: 'Price', value:result[pp-1].careertype, inline:true },
            { name: 'Expected Duration', value:result[pp-1].duration, inline:true },
            { name: 'Description', value:result[pp-1].unsecure, inline:true }
           )
           .setFooter('Contracts - Mobitracker.co');
        message.channel.send(embed);
      }
    });
  }
  if(command == 'alerts'){
    if(args.length>1){
      return message.author.send('Too many arguments.');
    }else if(args.length == 0){
      const sql = "SELECT contracts, prevContracts, applicants, prevApplicants, reviews, prevReviews FROM discordAlerts WHERE discordUser->'$.id' = '"+message.author.id+"'";
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
    const sql = "SELECT contracts, prevContracts, applicants, prevApplicants, reviews, prevReviews FROM discordAlerts WHERE discordUser->'$.id' = '"+message.author.id+"'";
    con.query(sql, function (err, result, fields) {
      if(err) throw err;
      if(result.length > 0 && args.length > 0){
        args[0] = args[0].toString().toLowerCase();
        if(args[0] == "off"){
          const sql = "UPDATE discordAlerts SET pause = 1 WHERE discordUser->'$.id' = '"+message.author.id+"'";
          con.query(sql, function (err, result, fields) {
            if(err) throw err;
            console.log(message.author.tag+" turned off their alerts");
            message.author.send("Paused Alerts.");
          });
        }else if(args[0] == "on"){
          const sql = "UPDATE discordAlerts SET pause = 0 WHERE discordUser->'$.id' = '"+message.author.id+"'";
          con.query(sql, function (err, result, fields) {
            if(err) throw err;
            console.log(message.author.tag+" turned on their alerts");
            message.author.send("Resumed Alerts.");
          });
        }
      }
    });
  }
  if(command == 'help'){
    message.channel.send("MobiTracker's Discord bot is very simple to use! \n\n!help - Bring up this help message \n\n!search USERNAME - Find any user in the verse by their ingame name quickly and displaying all the information you'd find online at https://mobitracker.co \n\n!auth - The command to authorize and edit your alert policies! \nGet your auth token at https://mobitracker.co/discord \n\n!alerts on/off - Pause and Resume your alert policy!");
  }
  //message.channel.send("This is MobiTracker.co 's official Discord bot. \nCurrent Commands: \n!search RSI_HANDLE \n !auth TOKEN - This token is received from https://mobitracker.co/auth \n!alerts'");
  if (!message.content.startsWith(`${prefix}`)) return;
});

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
      if(event.table == 'discordAlerts'){
        const alertBefore = event.affectedRows[0].before;
        const alertAfter = event.affectedRows[0].after;
        const user = event.affectedRows[0].after.discordUser;
        const id = JSON.parse(user);
        if(alertAfter.contracts > alertBefore.contracts){
          if(alertAfter.contracts != -1){
            if(alertAfter.contracts == 1){
              client.users.cache.get(id.id).send("You have a new contract available to you! \nhttps://mobitracker.co/contracts");
            }else if(alertAfter.contracts > 1){
              client.users.cache.get(id.id).send("You have "+alertAfter.contracts+" contracts available to you! \nhttps://mobitracker.co/contracts");
            }
          }
        }else if(alertAfter.contracts < alertBefore.contracts){
          if(alertAfter.contracts != -1){
            if(alertAfter.contracts == 1){
              client.users.cache.get(id.id).send("You have a new contract available to you! \nhttps://mobitracker.co/contracts");
            }else if(alertAfter.contracts > 1){
              client.users.cache.get(id.id).send("You have "+alertAfter.contracts+" contracts available to you! \nhttps://mobitracker.co/contracts");
            }
          }
        }
        if(alertAfter.applicants > alertBefore.applicants){
          if(alertAfter.applicants != -1){
            if(alertAfter.applicants == 1){
              client.users.cache.get(id.id).send("Someone applied to one of your contracts! \nhttps://mobitracker.co/contracts");
            }else if(alertAfter.applicants > 1){
              client.users.cache.get(id.id).send(alertAfter.applicants+" people have applied to one of your contracts! \nhttps://mobitracker.co/contracts");
            }
          }
        }
        if(alertAfter.reviews > alertBefore.reviews){
          if(alertAfter.reviews != -1){
            if(alertAfter.reviews == 1){
              client.users.cache.get(id.id).send("You have a new review on your profile! \nhttps://mobitracker.co/"+alertAfter.username);
            }else if(alertAfter.reviews > 1){
              client.users.cache.get(id.id).send("You have "+alertAfter.reviews+" new reviews on your profile! \nhttps://mobitracker.co/"+alertAfter.username);
            }
          }
        }else if(alertAfter.reviews < alertBefore.reviews){
          if(alertAfter.reviews != -1){
            client.users.cache.get(id.id).send("Someone removed review on your profile! \nhttps://mobitracker.co/"+alertAfter.username);
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
