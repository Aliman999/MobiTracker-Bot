'use strict';
const { Client, MessageEmbed } = require('discord.js');
const config  = require('./config');
const prefix = '!';
const client = new Client();
const https = require('https');

function affiliations(aff){
  var display;
  for (var i = 0; i < aff.length; i++) {
    display = display+aff.rank+' in '+'['+aff.name+']'+'(https://robertsspaceindustries.com/orgs/'+aff.sid+')'+'\n';
  }
  return display;
}

client.on('ready', () => {
  console.log('I am ready!');
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
      console.log(`statusCode: ${res.statusCode}`)
      res.on('data', d => {
        const user = JSON.parse(d);
        console.log(user);

        const embed = new MessageEmbed()
          .setColor(0x39ced8)
          .setAuthor(user.data.profile.handle+" "+user.data.profile.id, user.data.profile.image, "https://mobitracker.co/"+user.data.profile.handle)
          .setDescription("AKA "+user.data.profile.display)
          .addFields(
            { name: 'Title', value: user.data.profile.title, inline: true},
            { name: 'Mobitracker Rating', value: "5/5 (3)", inline: true},
            { name: 'Main Organization', value: user.data.organization.rank+' in '+'['+user.data.organization.name+'](https://robertsspaceindustries.com/orgs/'+user.data.organization.sid+')' },
            { name: 'Affiliated Organizations', value: affiliations(user.data.affiliation)}
           )
           .setFooter(`${args}`+' - Mobitracker.co', 'https://mobitracker.co/android-chrome-192x192.png');
      })
    })
    req.on('error', error => {
      console.error(error)
    })
    while(!user){
      if(user){
        message.channel.send(embed);
        break;
      }
    }
  }

  if (message.content === `${prefix}server`) {
	   message.channel.send(`Server name: ${message.guild.name}\nTotal members: ${message.guild.memberCount}`);
  }
  if (!message.content.startsWith(`${prefix}`)) return;
  // If the message is "how to embed"
});

client.login(config.Key);
