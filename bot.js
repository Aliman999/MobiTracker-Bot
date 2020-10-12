'use strict';
const { Client, MessageEmbed } = require('discord.js');
const config  = require('./config');
const prefix = '!';
const client = new Client();
const https = require('https');
var mysql = require('mysql');

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

client.on('message', message => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'search'){
  	if (!args.length){
  		return message.channel.send(`You didnt provide a username, ${message.author}!`);
  	}else if (args.length > 1) return;
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
        console.log(user.data.oraganization);
        if(Object.size(user.data.oraganization) > 0){
          user.data.organization.name = user.data.organization.rank+' in '+'['+user.data.organization.name+'](https://robertsspaceindustries.com/orgs/'+user.data.organization.sid+')';
        }else{
          user.data.organization.name = "REDACTED";
        }
        if(Object.size(user.data) > 0){
          const cID = user.data.profile.id.substring(1);
          const sql = "SELECT avgRating as rating, reviewed_count as count FROM players WHERE username = '"+user.data.profile.handle+"'"+" AND cID = "+cID;
          con.query(sql, function (err, result, fields) {
            if (err) throw err;
            var rating = "";
            if(result.length == 0){
              rating = "Not Rated";
            }else{
              if(result[0].rating == -1){
                rating = "Not Rated";
              }else{
                rating = result[0].rating+"/5 "+"("+result[0].count+")";
              }
            }
            const embed = new MessageEmbed()
              .setColor(0x39ced8)
              .setAuthor(user.data.profile.handle+" "+user.data.profile.id, user.data.profile.image, "https://mobitracker.co/"+user.data.profile.handle)
              .setDescription("AKA "+user.data.profile.display)
              .addFields(
                { name: 'Badge', value: user.data.profile.badge, inline: true},
                { name: 'Mobitracker Rating', value: rating, inline: true},
                { name: 'Main Organization', value: user.data.organization.name },
                { name: 'Affiliated Organizations', value: affiliations(user.data.affiliation)}
               )
               .setFooter(user.data.profile.handle+' - Mobitracker.co', 'https://mobitracker.co/android-chrome-192x192.png');
            message.channel.send(embed);
          });
        }else{
          message.channel.send(`That user doesnt exist, ${message.author}!`);
        }
      })
    })

    req.on('error', error => {
      console.error(error)
    })

    req.end()
  }

  if (message.content === `${prefix}server`) {
	   message.channel.send(`Server name: ${message.guild.name}\nTotal members: ${message.guild.memberCount}`);
  }
  if (!message.content.startsWith(`${prefix}`)) return;
  // If the message is "how to embed"
});

client.login(config.Key);
