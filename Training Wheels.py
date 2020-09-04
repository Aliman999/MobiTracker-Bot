import discord

client = discord.Client()
bot = commands.Bot(command_prefix = '!')

@bot.command()
    async def quit(ctx, quit):
        await


@client.event
async def on_ready():
    print('We have logged in as {0.user}'.format(client))

@client.event
async def on_message(message):
    if message.author == client.user:
        return

    if message.content.startswith('!search'):
        await message.channel.send('Not found')



client.run('NzUxMjUyNjE3NDUxMTQzMjE5.X1GYhQ.lpeuSNw1EAvFoZX7TZZrXwGOvog')
