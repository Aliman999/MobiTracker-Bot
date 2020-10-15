'use strict';
const { Client, MessageEmbed} = require('discord.js');
const config  = require('./config');
const prefix = '!';
const fs = require('fs');
const client = new Client();
const https = require('https');
const mysql = require('mysql');
const WebSocket = require('ws');
var wsClient;
var jwt = require('jsonwebtoken');

const botToken = jwt.sign({ username:'mtcobot', cid: '0000001' }, config.Secret, { algorithm: 'HS256' }, { 'iat':Math.floor(Date.now()/1000) });
const msg = {
  type:"bot",
  token: botToken
};

function connectEvent(){
  try{
    wsClient = new WebSocket('wss://mobitracker.co:8000');

    wsClient.on('open', function(){
      wsClient.send(JSON.stringify(msg));
    });

    wsClient.on('message', function(response){
      response = JSON.parse(response);
      console.log(response.event);
    });

    wsClient.on('close', function(){
      clearTimeout(this.pingTimeout);
    })

    wsClient.on('error', function(err){
      console.log('Failed to connect to Event Server.');
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
    fs.appendFile('/home/ubuntu/bot/bot.log', msg+'\n', function(err) {
        if(err) {
            return trueLog(err);
        }
    });
    trueLog(msg);
}

var con = mysql.createConnection({
  host: config.MysqlHost,
  user: config.MysqlUsername,
  password: config.MysqlPassword,
  database: config.MysqlDatabase
});

con.connect(function(err) {
  if (err) throw err;
  console.log("Connected to Mobitracker Database");
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

Object.size = function(obj) {
  var size = 0, key;
  for (key in obj) {
      if (obj.hasOwnProperty(key)) size++;
  }
  return size;
};

client.on('ready', () => {
  console.log('MobiTracker Bot is Ready');
});

async function reply(message, args){
  console.log(message);
    if(message.length == 0){
      message[0].author.send(args).catch(e => {
          message.channel.send("It seems you dont have DM's enabled. We wont beable to contact you with DM's disabled. \n"+`${message.author}`);
      });
    }else{
      message[message.length].author.send(args).catch(e => {
          message.channel.send("It seems you dont have DM's enabled. We wont beable to contact you with DM's disabled. \n"+`${message.author}`);
      });
    }
}

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
          }else if (user.data.organization.name == "") {
            user.data.organization.name = "REDACTED";
          }else {
            user.data.organization.name = "None";
          }
          const cID = user.data.profile.id.substring(1);
          const sql = "SELECT avgRating as rating, reviewed_count as count FROM players WHERE username = '"+user.data.profile.handle+"'"+" AND cID = "+cID;
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
            const embed = new MessageEmbed()
              .setColor(0x25a6dd)
              .setAuthor(user.data.profile.handle+" "+user.data.profile.id, user.data.profile.image, "https://mobitracker.co/"+user.data.profile.handle)
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

  }else if(command == 'auth'){
    if(!args.length){
      return message.channel.send('Sign in at https://mobitracker.co/login and click the button that says "Authenticate with Discord". \nThen and copy the text provided and paste it here.');
    }else if(args.length>1){
      return message.channel.send('Too many arguments.');
    }else{
      jwt.verify(`${args}`, config.Secret, { algorithm: 'HS265' }, function (err, decoded){
        if(err){
          console.log(err);
        }else{
          if(decoded.cid != "" && decoded.username != ""){
            const authUser = message.author;
            delete authUser.lastMessageChannelID;
            const token = jwt.sign({ mtUser: { cid:decoded.cid, username:decoded.username }, discordUser: authUser}, config.Secret, { algorithm: 'HS256' }, { 'iat':Math.floor(Date.now()/1000) });
            const msg = {
              type:"authDiscord",
              token: token
            };
            wsClient.send(JSON.stringify(msg));
            wsClient.on('message', function(response){
              response = JSON.parse(response);
              if(response.data == 'success'){
                reply(message, 'Your discord is now linked with '+decoded.username+' \nhttps://mobitracker.co/'+decoded.username+' \nRemmember to share a server containing this bot to keep getting alerts! \nYou may toggle alerts with !alerts.');
              }else if(response.data == 'exists'){
                reply(message, 'Your account is already linked.');
              }else if(response.data == 'nonexists'){
                reply(message, 'You must sign up at https://mobitracker.co/register To get discord alerts.');
              }
              response = "";
            });
          }else{
            message.channel.send('The token was invalid. Please copy the provided token from https://mobitracker.co/auth');
          }
        }
      });
    }
  }else if(command == 'alerts'){

  }
  //message.channel.send("This is MobiTracker.co 's official Discord bot. \nCurrent Commands: \n!search RSI_HANDLE \n !auth TOKEN - This token is received from https://mobitracker.co/auth \n!alerts'");
  if (!message.content.startsWith(`${prefix}`)) return;
});

client.login(config.Key);
