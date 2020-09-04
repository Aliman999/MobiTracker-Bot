import discord
from discord.ext import commands
client = discord.Client()
bot = commands.Bot(command_prefix='$')


@client.event
async def on_ready():
    print('We have logged in as {0.user}'.format(client))

@bot.command()
async def foo(ctx, arg):
    await ctx.send(arg)
    #w = open("wee.txt", "r")
    #dusky = w.readlines()
#Errr?

bot.run('NzUxMjUyNjE3NDUxMTQzMjE5.X1GYhQ.lpeuSNw1EAvFoZX7TZZrXwGOvog')
