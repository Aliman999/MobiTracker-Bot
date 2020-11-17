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
const wsClient = new WebSocket("wss://mobitracker.co:8000");
var jwt = require('jsonwebtoken');
var discordClients = [];

const botToken = jwt.sign({ mtUser:{username:'mtcobot', cid: '0000001'} }, config.Secret, { algorithm: 'HS256' }, { 'iat':Math.floor(Date.now()/1000) });
const msg = {
  type:"bot",
  token: botToken
};

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

function decodeEntities(encodedString) {
  return encodedString.replace('&#039;', "'");
}
function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
          }else{
            user.data.profile.id = '#No Citizen ID';
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
  if(command == 'contracts'){
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
          .setColor(0x25a6dd)
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
  if(command == 'alerts'){
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
  if(command == 'help'){
    message.channel.send("MobiTracker's Discord bot is very simple to use! \n\n!help - Bring up this help message \n\n!search USERNAME - Find any user in the verse by their ingame name quickly and displaying all the information you'd find online at https://mobitracker.co \n\n !contracts PAGENUMBER - Search through MobiTrackers Contracts by the page number and See what people are doing! \n\n!auth - The command to authorize and edit your alert policies! \nGet your auth token at https://mobitracker.co/discord \n\n!alerts on/off - Pause and Resume your alert policy!");
  }
  //message.channel.send("This is MobiTracker.co 's official Discord bot. \nCurrent Commands: \n!search RSI_HANDLE \n !auth TOKEN - This token is received from https://mobitracker.co/auth \n!alerts'");
  if (!message.content.startsWith(`${prefix}`)) return;
});

function test(){
  console.log("test");
};

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
        const show = { contracts:JSON.parse(alert.contracts), applications:JSON.parse(alert.applicants), reviews:JSON.parse(alert.reviews), escrow:JSON.parse(alert.escrow) };
        console.log(show.applications);
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
          .setFooter(alert.username+' - Mobitracker.co');

        var index = Object.keys(show);
        for(var i = 0; i < Object.keys(show).length; i++){
          if(show[index[i]].active){
            if(i == 1){
              var title = [ index[i].myApplications.charAt(0).toUpperCase() + index[i].slice(1), index[i].myContracts.charAt(0).toUpperCase() + index[i].slice(1) ];
              console.log(title);
            }else{
              var title = index[i].charAt(0).toUpperCase() + index[i].slice(1);
            }
            if(show[index[i]].count>0){
              if(i == 1){
                embed.addFields({ name: title+" - "+show[index[i]].count, value:"\u200B" });
                embed.addFields({ name: "Latest", value: show[index[i]].events[(show[index[i]].count-1)], inline: true });
                if(show[index[i]].count>1){
                  embed.addFields({ name: "Previous", value: show[index[i]].events[(show[index[i]].count-2)], inline: true });
                }
              }else{
                embed.addFields({ name: title+" - "+show[index[i]].count, value:"\u200B" });
                embed.addFields({ name: "Latest", value: show[index[i]].events[(show[index[i]].count-1)], inline: true });
                if(show[index[i]].count>1){
                  embed.addFields({ name: "Previous", value: show[index[i]].events[(show[index[i]].count-2)], inline: true });
                }
              }
            }else{
              embed.addFields({ name: title+" - "+show[index[i]].count, value: "No notifications" });
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
    },
  });
  instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
  instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
};
program().then(() => console.log('Waiting for database events...')).catch(console.error);

client.login(config.Key);
