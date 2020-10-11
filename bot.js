'use strict';
const { Client, MessageEmbed } = require('discord.js');
const config  = require('./config');
const client = new Client();

client.on('ready', () => {
  console.log('I am ready!');
});

client.on('message', message => {
  if (message.content === 'ping') {
    message.channel.send('pong');
  }
  // If the message is "how to embed"
  if (message.content === 'how to embed') {
    // We can create embeds using the MessageEmbed constructor
    // Read more about all that you can do with the constructor
    // over at https://discord.js.org/#/docs/main/master/class/MessageEmbed
    const embed = new MessageEmbed()
      // Set the title of the field
      .setTitle('MobiTracker.co')
      // Set the color of the embed
      .setColor(0x39ced8)
      // URL to the client's Profile
      .setURL("https://mobitracker.co/JamesDusky");
      // Set the main content of the embed
      .setDescription('');
    // Send the embed to the same channel as the message
    message.channel.send(embed);
  }
});

client.login(config.Key);
