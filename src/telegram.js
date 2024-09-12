const TelegramBot = require('node-telegram-bot-api');
const Web3 = require('web3');
const { TelegramGroup } = require('../models/model');
const contractAbi = require('../abis/dank.json');
const tokenABI = require('../abis/coin.json')

const TELEGRAM_BOT_TOKEN = '6225762529:AAGLcw4RuMfFV6S8xN7hGxlZh6U8t6vC_Tw';
const TELEGRAM_BOT_TOKEN_TEST = "6845541149:AAE71UFuRkLEhH-PLoykr21fGAXHZ6j7hbY";
const BANNER_IMAGE_URL = 'https://dankboy.com/hero_bg.jpg';

const init_TelegramBot = (isTest = false) => {

    const web3 = new Web3(isTest ? 'https://ethereum-sepolia-rpc.publicnode.com' : 'https://ethereum-rpc.publicnode.com');
    const bot = new TelegramBot(isTest ? TELEGRAM_BOT_TOKEN_TEST : TELEGRAM_BOT_TOKEN, { polling: true });
    // Store listeners to remove them when configs change
    const listeners = {};

    bot.onText(/\/settings/, async (msg) => {
        const chatId = msg.chat.id;
        // Check if the sender is the owner or an admin
        bot.getChatAdministrators(chatId).then(admins => {
            const isAdmin = admins.some(admin => admin.user.id === msg.from.id);
            if (!isAdmin) {
                bot.sendMessage(chatId, "Only admins or the group owner can set this up.");
                return;
            }
            bot.sendMessage(chatId, "Input Emoji").then((sentMsg) => {
                bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
                    const emoji = replyMsg.text.trim();
                    let group = await TelegramGroup.findOne({ chatId, isTest });
                    if (!group) {
                        bot.sendMessage(chatId, "Can't update Emoji before register");
                    } else {
                        group.emoji = emoji;
                        await group.save();
                        bot.sendMessage(chatId, "Emoji updated.");
                        bot.sendMessage(chatId, "Input Banner Image Url").then((sentMsg) => {
                            bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
                                const imageUrl = replyMsg.text.trim();
                                let group = await TelegramGroup.findOne({ chatId, isTest });
                                if (!group) {
                                    bot.sendMessage(chatId, "Can't update Image before register");
                                } else {
                                    group.banner = imageUrl;
                                    await group.save();
                                    bot.sendMessage(chatId, "Image updated.");
                                    refreshMonitoring();
                                }
                            });
                        });
                        refreshMonitoring();
                    }
                });
            });
        });
    })

    // Handle /subscribe <token_address> command
    bot.onText(/\/subscribe@DankFunBot/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
            bot.sendMessage(chatId, 'This command can only be used in groups.');
            return;
        }
        // Check if the sender is the owner or an admin
        bot.getChatAdministrators(chatId).then(admins => {
            const isAdmin = admins.some(admin => admin.user.id === msg.from.id);
            if (!isAdmin) {
                bot.sendMessage(chatId, "Only admins or the group owner can set this up.");
                return;
            }

            // Proceed to ask for the Contract Address
            bot.sendMessage(chatId, "Type CA:").then((sentMsg) => {
                // Listen for the next message (reply) providing the contract address
                bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
                    const dankPumpAddress = replyMsg.text.trim();
                    // Ensure it's a valid Ethereum address
                    if (!web3.utils.isAddress(dankPumpAddress)) {
                        bot.sendMessage(chatId, "Invalid contract address. Please ensure you're using a correct Ethereum address format.");
                        return;
                    }
                    const contract = new web3.eth.Contract(contractAbi, dankPumpAddress);
                    const tokenName = await contract.methods.symbol().call();

                    // Store the information
                    let group = await TelegramGroup.findOne({ chatId, isTest });
                    if (!group) {
                        await TelegramGroup.create({ chatId, dankPumpAddress, tokenName, isTest, emoji: '🚀', banner: BANNER_IMAGE_URL });
                        bot.sendMessage(chatId, "Successfully registered. Notifications will now be monitored for this token.");
                    } else {
                        group.dankPumpAddress = dankPumpAddress;
                        group.tokenName = tokenName;
                        await group.save();
                        bot.sendMessage(chatId, "Token contract address updated.");
                    }
                    refreshMonitoring(); // Refresh monitoring when a group is added or updated
                });
            });
        }).catch(error => console.error("Failed to retrieve chat admins: ", error));

    });

    // Function to refresh all monitoring processes
    async function refreshMonitoring() {
        // Retrieve all groups and their token contract addresses
        const groups = await TelegramGroup.find({ isTest });

        // Clear all existing event subscriptions
        for (const token of Object.keys(listeners)) {
            listeners[token].unsubscribe();
            delete listeners[token];
        }

        // Set up new event listeners for each group's token contract address
        groups.forEach(group => {
            const { dankPumpAddress, chatId, emoji, banner } = group;
            monitorTokenBuys(dankPumpAddress, chatId, emoji, banner);
        });
    }

    // Monitor transactions for a specific token contract
    function monitorTokenBuys(dankPumpAddress, chatId, emoji, banner) {
        if (listeners[dankPumpAddress]) {
            // If already monitoring this contract, don't set up a new listener
            return;
        }
        const web3Subscription = new Web3(isTest ? 'wss://ethereum-sepolia-rpc.publicnode.com' : 'wss://ethereum-rpc.publicnode.com');
        const contract = new web3Subscription.eth.Contract(contractAbi, dankPumpAddress);

        listeners[dankPumpAddress] = contract.events.Buy({ fromBlock: 'latest' })
            .on('data', async (event) => {
                const transactionHash = event.transactionHash;
                const from = event.returnValues[0];
                const dankPumpAddress = event.address;
                const contract = new web3.eth.Contract(contractAbi, dankPumpAddress);
                const [tokenName, tokenAddress, ethPriceResponse] = await Promise.all([
                    contract.methods.symbol().call(),
                    contract.methods.token().call(),
                    fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD', { method: 'GET' })
                ])
                const ethPriceData = await ethPriceResponse.json()
                const ethPrice = ethPriceData.USD
                const ethAmount = Number(web3.utils.fromWei(event.returnValues[1], 'ether'));
                const tokenAmount = Number(web3.utils.fromWei(event.returnValues[2], 'ether'));
                const virtualEthLp = event.returnValues[3];
                const marketCap = Number(web3.utils.fromWei(event.returnValues[4], 'ether') * ethPrice);
                const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);
                const tokenBalance = Number(web3.utils.fromWei(await tokenContract.methods.balanceOf(from).call(), 'ether'));
                const risePercent = (tokenAmount) / (tokenBalance - tokenAmount) * 100;

                console.log(transactionHash, from, ethAmount, tokenAmount, virtualEthLp, marketCap)
                const message = `${tokenName} __Buy!__
${new Array(Math.min(50, Number((ethAmount * ethPrice / 4).toFixed(0)))).fill(emoji)}
💵 ${ethAmount.toLocaleString('en-US')} ETH ($${Number(ethAmount * ethPrice).toLocaleString('en-US')})
🔀 ${tokenAmount.toLocaleString('en-US')} **${tokenName}**
👤 [${shortenAddress(from)}](https://${isTest ? 'sepolia.' : ''}etherscan.io/address/${from}) | [Txn](https://${isTest ? 'sepolia.' : ''}etherscan.io/tx/${transactionHash})
🪙 ${tokenBalance - tokenAmount < 0.1 ? '**New Holder**' : "Position +" + risePercent.toLocaleString() + "%"}
💸 Market Cap: $${marketCap.toLocaleString('en-US')}`;

                bot.sendPhoto(chatId, banner, { caption: message, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Buy', url: `https://pump.dankboy.com/buy/?chain=${isTest ? 11155111 : 1}&address=${dankPumpAddress}` }]] } });
            })
            .on('error', console.error);
    }

    // Initial call to set up monitoring
    refreshMonitoring();

    // Set an interval to periodically refresh the monitoring
    setInterval(refreshMonitoring, 300000); // Refresh every 5 minutes (300000 ms)

    console.log('Bot is running...');
}

function shortenAddress(address, chars = 4) {
    if (address.length < 2 * chars + 2) {
        return address; // Return the original if it's too short to abbreviate properly
    }
    const start = address.substring(0, chars + 2); // Include "0x" and first 'chars' characters
    const end = address.substring(address.length - chars);
    return `${start}…${end}`;
}

module.exports = init_TelegramBot;
