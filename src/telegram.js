const TelegramBot = require('node-telegram-bot-api');
const Web3 = require('web3');
const { TelegramGroup, StatusData } = require('../models/model');
const contractAbi = require('../abis/dank.json');
const tokenABI = require('../abis/coin.json')
const uniswapV2FactoryAbi = require('../abis/v2factory.json');
const uniswapV2PairAbi = require('../abis/v2Pair.json');
const pumpFactoryAbi = require('../ab/pumpFactory.json');

const TELEGRAM_BOT_TOKEN = '6225762529:AAGLcw4RuMfFV6S8xN7hGxlZh6U8t6vC_Tw';
const TELEGRAM_BOT_TOKEN_TEST = "6845541149:AAE71UFuRkLEhH-PLoykr21fGAXHZ6j7hbY";
const BANNER_IMAGE_URL = 'https://dankboy.com/hero_bg.jpg';
const UNISWAP_V2_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const UNISWAP_V2_FACTORY_ADDRESS_TEST = "0x7E0987E5b3a30e3f2828572Bb659A548460a3003";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WETH_ADDRESS_TEST = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
const PUMP_FACTORY_ADDRESS = "0xf8BC6f1a49560A56efD9D286B611083B718E1dc0";
const PUMP_FACTORY_ADDRESS_TEST = "0xf8BC6f1a49560A56efD9D286B611083B718E1dc0";

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
            bot.sendMessage(chatId, "Set your Emoji and Banner Image", { reply_markup: { inline_keyboard: [[{ text: 'Set Emoji', callback_data: 'emoji' }, { text: 'Set Banner', callback_data: 'banner' }]] } })
        });
    })

    bot.on('callback_query', async (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data; // This is your callback_data
        let group = await TelegramGroup.findOne({ chatId, isTest });
        if (!group) {
            bot.sendMessage(chatId, "Can't update Settings before subscribe");
            return;
        }
        switch (data) {
            case 'emoji':
                bot.sendMessage(chatId, "Input Emoji").then((sentMsg) => {
                    bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
                        const emoji = replyMsg.text?.trim();
                        if (!emoji) {
                            bot.sendMessage(chatId, "Invalid Emoji");
                        }
                        group.emoji = emoji;
                        await group.save();
                        refreshCertainMonitor(group.dankPumpAddress, group.chatId, group.emoji, group.banner);
                        bot.sendMessage(chatId, "Emoji updated.");
                    });
                });
                break;
            case 'banner':
                bot.sendMessage(chatId, "Input Banner Image Url").then((sentMsg) => {
                    bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, async (replyMsg) => {
                        const imageUrl = replyMsg.text?.trim();
                        if (!imageUrl) {
                            bot.sendMessage(chatId, "Invalid Banner Image Url");
                        }
                        try {
                            const response = await fetch(imageUrl, { method: 'GET' });
                            if (response.ok && response.headers.get('Content-Type').includes('image')) {
                                let group = await TelegramGroup.findOne({ chatId, isTest });
                                if (!group) {
                                    bot.sendMessage(chatId, "Can't update Image before register");
                                } else {
                                    group.banner = imageUrl;
                                    await group.save();
                                    bot.sendMessage(chatId, "Image updated.");
                                    refreshCertainMonitor(group.dankPumpAddress, group.chatId, group.emoji, group.banner);
                                }
                                return;
                            }
                        } catch (error) { }
                        bot.sendMessage(chatId, "Given Url doesn't exist");
                    });
                });
                break;
            default:
                break;
        }
        // Acknowledge the callback query
        bot.answerCallbackQuery(callbackQuery.id);
    });

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
                    const dankPumpAddress = replyMsg.text?.trim();
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
                        await TelegramGroup.create({ chatId, dankPumpAddress, lpCreated: false, pairAddress: "", tokenName, isTest, emoji: '🚀', banner: BANNER_IMAGE_URL });
                        bot.sendMessage(chatId, "Successfully registered. Notifications will now be monitored for this token.");
                    } else {
                        group.dankPumpAddress = dankPumpAddress;
                        group.tokenName = tokenName;
                        await group.save();
                        bot.sendMessage(chatId, "DankPump contract address updated.");
                    }
                    refreshMonitoring(); // Refresh monitoring when a group is added or updated
                })
                    .catch(error => bot.sendMessage(chatId, "Unkown Error!"));
            });
        }).catch(error => console.error("Failed to retrieve chat admins: ", error));

    });

    bot.onText(/\/unsubscribe@DankFunBot/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
            bot.sendMessage(chatId, 'This command can only be used in groups.');
            return;
        }
        // Check if the sender is the owner or an admin
        bot.getChatAdministrators(chatId).then(async (admins) => {
            const isAdmin = admins.some(admin => admin.user.id === msg.from.id);
            if (!isAdmin) {
                bot.sendMessage(chatId, "Only admins or the group owner can set this up.");
                return;
            }
            await TelegramGroup.deleteOne({ chatId, isTest });
            bot.sendMessage(chatId, "Your Token is successfully unsubscribed");
        }).catch(error => console.error("Failed to retrieve chat admins: ", error));
    });

    bot.onText(/\/register@DankFunBot/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
            bot.sendMessage(chatId, 'This command can only be used in groups.');
            return;
        }
        // Check if the sender is the owner or an admin
        bot.getChatAdministrators(chatId).then(async (admins) => {
            const isAdmin = admins.some(admin => admin.user.id === msg.from.id);
            if (!isAdmin) {
                bot.sendMessage(chatId, "Only admins or the group owner can set this up.");
                return;
            }
            let status = await StatusData.findOne({ key: 'mainGroupId' });
            if (!status) {
                await StatusData.create({ key: 'mainGroupId', value: chatId });
                bot.sendMessage(chatId, "Successfully registered. Notifications will now be monitored.");
            } else {
                status.value = chatId;
                await status.save();
                bot.sendMessage(chatId, "DankPump Factory contract address updated.");
            }
        }).catch(error => console.error("Failed to retrieve chat admins: ", error));
    });

    // Function to refresh all monitoring processes
    async function refreshMonitoring() {
        try {
            // Retrieve all groups and their token contract addresses
            const groups = await TelegramGroup.find({ isTest, lpCreated: false });
            const groups_lpCreated = await TelegramGroup.find({ isTest, lpCreated: true });

            // Clear all existing event subscriptions
            for (const dank of Object.keys(listeners)) {
                listeners[dank].unsubscribe();
                delete listeners[dank];
            }

            monitorNewTokenLaunch();

            // Set up new event listeners for each group's token contract address
            groups.forEach(group => {
                const { dankPumpAddress, chatId, emoji, banner } = group;
                monitorTokenBuys(dankPumpAddress, chatId, emoji, banner);
            });
            groups_lpCreated.forEach(group => {
                const { pairAddress, chatId, emoji, banner, tokenName } = group;
                monitorTokenBuysForPair(pairAddress, tokenName, chatId, emoji, banner);
            });
        } catch (error) {

        }
    }

    function refreshCertainMonitor(dankPumpAddress, chatId, emoji, banner) {
        listeners[dankPumpAddress].unsubscribe();
        delete listeners[dankPumpAddress];
        monitorTokenBuys(dankPumpAddress, chatId, emoji, banner);
    }

    async function monitorNewTokenLaunch() {
        const pumpFactoryAddress = isTest ? PUMP_FACTORY_ADDRESS_TEST : PUMP_FACTORY_ADDRESS;
        if (listeners[pumpFactoryAddress]) {
            // If already monitoring this contract, don't set up a new listener
            return;
        }
        if (!isTest) return;
        let status = await StatusData.findOne({ key: 'mainGroupId' });
        if (!status) return;
        const web3Subscription = new Web3(isTest ? 'wss://ethereum-sepolia-rpc.publicnode.com' : 'wss://ethereum-rpc.publicnode.com');
        const factoryContract = new web3Subscription.eth.Contract(pumpFactoryAbi, pumpFactoryAddress);
        listeners[pumpFactoryAddress] = factoryContract.events.NewTokenCreated({ fromBlock: 'latest' });
        listeners[pumpFactoryAddress]
            .on('data', async (event) => {
                const transactionHash = event.transactionHash;
                console.log(event)
                const from = event.returnValues[0];
                const tokenAddress = event.returnValues[0];
                const dankPumpAddress = event.returnValues[1];
                const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);
                const contract = new web3.eth.Contract(contractAbi, dankPumpAddress);
                const [pumpInfo] = await Promise.all([
                    contract.methods.getFunBasicInfo().call()
                ])
                const [name, symbol, website, twitter, telegram, discord, info] = pumpInfo[1];

                const banner = `https://api.dankboy.com/${dankPumpAddress}-banner.png`;
                const message = `New Token Launched!
💵 Name: ${name}
🪙 Symbol: ${symbol}${website?.length > 0 ? '\nWebsite: ' + website : ''}${twitter?.length > 0 ? '\nTwitter: ' + twitter : ''}${telegram?.length > 0 ? '\nTelegram: ' + telegram : ''}${discord?.length > 0 ? '\nDiscord: ' + discord : ''}
👤 [${shortenAddress(from)}](https://${isTest ? 'sepolia.' : ''}etherscan.io/address/${from}) | [token](https://${isTest ? 'sepolia.' : ''}etherscan.io/address/${tokenAddress}) | [contract](https://${isTest ? 'sepolia.' : ''}etherscan.io/address/${contract})`;
                console.log(message, status.value.toString())
                bot.sendPhoto(status.value.toString(), banner, { caption: message, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Buy', url: `https://pump.dankboy.com/buy/?chain=${isTest ? 11155111 : 1}&address=${dankPumpAddress}` }]] } });
            })
            .on('error', console.error);
    }

    // Monitor transactions for a specific token contract
    function monitorTokenBuys(dankPumpAddress, chatId, emoji, banner) {
        if (listeners[dankPumpAddress]) {
            // If already monitoring this contract, don't set up a new listener
            return;
        }
        const web3Subscription = new Web3(isTest ? 'wss://ethereum-sepolia-rpc.publicnode.com' : 'wss://ethereum-rpc.publicnode.com');
        const contract = new web3Subscription.eth.Contract(contractAbi, dankPumpAddress);
        listeners[dankPumpAddress] = contract.events.Buy({ fromBlock: 'latest' });
        listeners[dankPumpAddress]
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
                const marketCap = web3.utils.fromWei(event.returnValues[4], 'ether');
                const marketCapUsd = Number(marketCap * ethPrice);
                const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);
                const tokenBalance = Number(web3.utils.fromWei(await tokenContract.methods.balanceOf(from).call(), 'ether'));
                const risePercent = (tokenAmount) / (tokenBalance - tokenAmount) * 100;

                console.log(transactionHash, from, ethAmount, tokenAmount, virtualEthLp, marketCapUsd)
                if (marketCap > 29.7) setTimeout(async () => {
                    updateListnerToPair(chatId, tokenAddress);
                }, 1000);
                const message = `${tokenName} __Buy!__
${new Array(Math.min(50, Number((ethAmount * ethPrice / 4).toFixed(0)))).fill(emoji)}
💵 ${ethAmount.toLocaleString('en-US')} ETH ($${Number(ethAmount * ethPrice).toLocaleString('en-US')})
🔀 ${tokenAmount.toLocaleString('en-US')} **${tokenName}**
👤 [${shortenAddress(from)}](https://${isTest ? 'sepolia.' : ''}etherscan.io/address/${from}) | [Txn](https://${isTest ? 'sepolia.' : ''}etherscan.io/tx/${transactionHash})
🪙 ${tokenBalance - tokenAmount < 0.1 ? '**New Holder**' : "Position +" + risePercent.toLocaleString() + "%"}
💸 Market Cap: $${marketCapUsd.toLocaleString('en-US')}`;

                bot.sendPhoto(chatId, banner, { caption: message, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Buy', url: `https://pump.dankboy.com/buy/?chain=${isTest ? 11155111 : 1}&address=${dankPumpAddress}` }]] } });

            })
            .on('error', console.error);
    }

    // Monitor transactions for a specific token contract
    function monitorTokenBuysForPair(pairAddress, tokenName, chatId, emoji, banner) {
        if (listeners[pairAddress]) {
            // If already monitoring this contract, don't set up a new listener
            return;
        }
        const web3Subscription = new Web3(isTest ? 'wss://ethereum-sepolia-rpc.publicnode.com' : 'wss://ethereum-rpc.publicnode.com');
        const contract = new web3Subscription.eth.Contract(uniswapV2PairAbi, pairAddress);
        console.log('initializing pair contract', isTest, pairAddress);
        listeners[pairAddress] = contract.events.Swap({ fromBlock: 'latest' })
            .on('data', async (event) => {
                console.log('swap event receievd');
                const transactionHash = event.transactionHash;
                const from = event.returnValues[0];
                const pairAddress = event.address;
                const contract = new web3.eth.Contract(uniswapV2PairAbi, pairAddress);
                const [token0, token1, reserves, ethPriceResponse] = await Promise.all([
                    contract.methods.token0().call(),
                    contract.methods.token1().call(),
                    contract.methods.getReserves().call(),
                    fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD', { method: 'GET' })
                ]);
                const ethPriceData = await ethPriceResponse.json()
                const ethPrice = ethPriceData.USD
                let ethAmount = 0;
                let tokenAmount = 0;
                let tokenAddress;
                let ethReserve = 0;
                let tokenReserve = 0;
                tokenPrice = 0;
                console.log(token1)
                if (token0 == (isTest ? WETH_ADDRESS_TEST : WETH_ADDRESS)) {
                    ethAmount = Number(web3.utils.fromWei(event.returnValues[1], 'ether'));
                    tokenAmount = Number(web3.utils.fromWei(event.returnValues[4], 'ether'));
                    tokenAddress = token1;
                    ethReserve = Number(web3.utils.fromWei(reserves[0], 'ether'));
                    tokenReserve = Number(web3.utils.fromWei(reserves[1], 'ether'));
                }
                else if (token1 == (isTest ? WETH_ADDRESS_TEST : WETH_ADDRESS)) {
                    ethAmount = Number(web3.utils.fromWei(event.returnValues[2], 'ether'));
                    tokenAmount = Number(web3.utils.fromWei(event.returnValues[3], 'ether'));
                    tokenAddress = token0;
                    ethReserve = Number(web3.utils.fromWei(reserves[1], 'ether'));
                    tokenReserve = Number(web3.utils.fromWei(reserves[0], 'ether'));
                }
                else return;
                const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);
                const [userBalance] = await Promise.all([
                    tokenContract.methods.balanceOf(from).call()
                ])
                const marketCap = ethReserve * 1000000000 / tokenReserve;
                const marketCapUsd = Number(marketCap * ethPrice);
                const tokenBalance = Number(web3.utils.fromWei(userBalance, 'ether'));
                const risePercent = (tokenAmount) / (tokenBalance - tokenAmount) * 100;
                if (ethAmount == 0) return;
                console.log(transactionHash, from, ethAmount, tokenAmount, marketCapUsd, tokenBalance)
                const message = `${tokenName} __Buy!__
${new Array(Math.min(50, Number((ethAmount * ethPrice / 4).toFixed(0)))).fill(emoji)}
💵 ${ethAmount.toLocaleString('en-US')} ETH ($${Number(ethAmount * ethPrice).toLocaleString('en-US')})
🔀 ${tokenAmount.toLocaleString('en-US')} **${tokenName}**
👤 [${shortenAddress(from)}](https://${isTest ? 'sepolia.' : ''}etherscan.io/address/${from}) | [Txn](https://${isTest ? 'sepolia.' : ''}etherscan.io/tx/${transactionHash})
🪙 ${tokenBalance - tokenAmount < 0.1 ? '**New Holder**' : "Position +" + risePercent.toLocaleString() + "%"}
💸 Market Cap: $${marketCapUsd.toLocaleString('en-US')}`;

                bot.sendPhoto(chatId, banner, { caption: message, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'Buy', url: `https://app.uniswap.org/buy/?inputCurrency=${isTest ? WETH_ADDRESS_TEST : WETH_ADDRESS}&outputCurrency=${tokenAddress}` }]] } });

            })
            .on('error', console.error);

    }

    async function updateListnerToPair(chatId, tokenAddress) {
        const factoryContract = new web3.eth.Contract(uniswapV2FactoryAbi, isTest ? UNISWAP_V2_FACTORY_ADDRESS_TEST : UNISWAP_V2_FACTORY_ADDRESS);
        const pairAddress = await factoryContract.methods.getPair(isTest ? WETH_ADDRESS_TEST : WETH_ADDRESS, tokenAddress).call();
        let group = await TelegramGroup.findOne({ chatId, isTest });
        group.lpCreated = true;
        group.pairAddress = pairAddress;
        await group.save();
    }

    // Initial call to set up monitoring
    refreshMonitoring();
    console.log('Bot is running...');
    if (isTest) return refreshMonitoring;
    else return refreshMonitoring;
}

function shortenAddress(address, chars = 4) {
    if (address.length < 2 * chars + 2) {
        return address; // Return the original if it's too short to abbreviate properly
    }
    const start = address.substring(0, chars + 2); // Include "0x" and first 'chars' characters
    const end = address.substring(address.length - chars);
    return `${start}…${end}`;
}



module.exports = { init_TelegramBot };
