'use strict';
const { Client, MessageEmbed } = require('discord.js');
const config  = require('./config');
const prefix = '!';
const client = new Client();

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
  	}else if (args.length > 1) {
  		return message.channel.send(`Too many arguments!, ${message.author}!`);
    }
  	//message.channel.send(`Command name: ${command}\nArguments: ${args}`);

    // We can create embeds using the MessageEmbed constructor
    // Read more about all that you can do with the constructor
    // over at https://discord.js.org/#/docs/main/master/class/MessageEmbed
    const embed = new MessageEmbed()
      // Set the color of the embed
      .setColor(0x39ced8)
      .setAuthor(`${args}`, 'https://robertsspaceindustries.com/media/f36tw6e9v746jr/heap_infobox/Portrait-Dark.jpg', "https://mobitracker.co/"+`${args}`)
      // Set the main content of the embed
      .setDescription('Test')
      .addFields(
        { name: 'Organization', value: 'Fleet of the Faithful Knights', inline: true },
    		{ name: 'Title', value: 'Civilian', inline: true},
    		{ name: 'Rating', value: '5/5', inline: true }
	     )
       .setFooter(`${args}`+' - Mobitracker.co', 'https://mobitracker.co/android-chrome-192x192.png');
    // Send the embed to the same channel as the message
    message.channel.send(embed);
  }

  if (message.content === `${prefix}server`) {
	   message.channel.send(`Server name: ${message.guild.name}\nTotal members: ${message.guild.memberCount}`);
  }
  if (!message.content.startsWith(`${prefix}`)) return;
  // If the message is "how to embed"
});

client.login(config.Key);
