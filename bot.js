'use strict';
const { Client, MessageEmbed } = require('discord.js');
const config  = require('./config');
const prefix = require('./prefix.json');
const client = new Client();

client.on('ready', () => {
  console.log('I am ready!');
});

client.on('message', message => {
  if (message.content === 'ping') {
    message.channel.send('pong');
  }

  if (message.content.startsWith(`${prefix.prefix}ping`)) {
  	message.channel.send('Pong.');
  } else if (message.content.startsWith(`${prefix.prefix}beep`)) {
    message.channel.send('Boop.');
  }
  // If the message is "how to embed"
  if (message.content === 'how to embed') {
    // We can create embeds using the MessageEmbed constructor
    // Read more about all that you can do with the constructor
    // over at https://discord.js.org/#/docs/main/master/class/MessageEmbed
    const embed = new MessageEmbed()
      // Set the color of the embed
      .setColor(0x39ced8)
      //This query is from mobitracker.co
      .setAuthor('Mobitracker.co', 'https://mobitracker.co/android-chrome-192x192.png')
      // Set the title of the field
      .setTitle('JamesDusky - Mobitracker.co')
      // URL to the client's Profile
      .setURL("https://mobitracker.co/JamesDusky")
      // Set the main content of the embed
      .setDescription('');
    // Send the embed to the same channel as the message
    message.channel.send(embed);
  }
});

client.login(config.Key);
