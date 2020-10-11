'use strict';
const Discord = require('discord.js');
const config  = require('./config');
const client = new Discord.Client();
client.on('ready', () => {
  console.log('I am ready!');
});
client.on('message', message => {
  if (message.content === 'ping') {
    message.channel.send('pong');
  }
});
client.login(config.Key);
