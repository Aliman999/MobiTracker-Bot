import discord
from discord.ext import commands
client = discord.Client()
bot = commands.Bot(command_prefix='$')

@bot.command(name='list')
async def _list(ctx, arg):
    pass

@client.event
async def on_ready():
    print('We have logged in as {0.user}'.format(client))

#@client.event
#async def on_message(message):
#    if message.author == client.user:
#        return
#
#    if message.content.startswith('Hello'):
#        await message.channel.send('Goodbye')

#Errr?
@bot.command()
async def foo(ctx, arg):
    await ctx.send(arg)
    #w = open("wee.txt", "r")
    #dusky = w.readlines()
    await ctx.send(arg)

client.run('NzUxMjUyNjE3NDUxMTQzMjE5.X1GYhQ.lpeuSNw1EAvFoZX7TZZrXwGOvog')
