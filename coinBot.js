const url = require('url');
const {
        VK
} = require('vk-io');

const {
    VCoinWS,
    Miner,
    Entit
} = require('./VCoinWS');

const {
    con,
    ccon,
    formatScore,
    infLog,
    rand,
    beep,
    mathPrice
} = require('./helpers');

const {
    offColors,
    autobeep
} = require('./settings');

const NO_TOKEN = "Бот остановлен (отсутствует токен). Информация о получении токена: github.com/cursedseal/VCoinX",
    URL_NO_VK_ID = "При анализе ссылки не был найден ID пользователя.",
    STARTING = "Бот запускается...",
    STARTED = "Бот запущен!",
    BAD_CONN_PAUSED = "Плохое соединение с сервером, бот был приостановлен.",
    NOT_ENOUGH_COINS = "Недостаточно средств для приобретения.",
    ITEM_404 = "Предмет не найден.",
    USER_LOADED = "Пользователь успешно загружен.",
    BRK_EVT = "Обнаружен brokenEvent, видимо сервер сломался.\n\t\tЧерез 10 секунд будет выполнен перезапуск.",
    SWITCH_SRV = "Достигнут лимит попыток подключиться к серверу.\n\t\t\tПроизводится смена сервера...",
    OTHER_DEVICE = "Обнаружено открытие приложения с другого устройства.\n\t\tЧерез 30 секунд будет выполнен перезапуск.",
    USER_OFFLINE = "Пользователь отключен от сервера.\n\t\tЧерез 20 секунд будет выполнен перезапуск.",
    TRANSFER_OK = "Перевод был выполнен успешно.",
    BAD_ARGS = "Вероятно, вы где-то указали неверный аргумент.",
    INVALID_TOKEN = "Указан некорректный токен пользователя! Перепроверьте токен или получите новый, как указано в данном руководстве -> github.com/cursedseal/VCoinX",
    NO_CONN = "Не удалось подключиться к API! Проверьте подключение к интернету или попробуйте установить VPN.";

const TOTAL_SERVERS = 4
;
function getDefault(val, def) {
     if (val !== undefined)
        return val;
    return def;
}

function formatWSS(link, user_id, server) {
    let gsearch = url.parse(link),
        naddrWS = gsearch.protocol.replace("https:", "wss:").replace("http:", "ws:") + "//" + gsearch.host + "/channel/",
        channel = user_id % 32;

    let URLWS = naddrWS + channel + "/" + gsearch.search + "&ver=1&pass=".concat(Entit.hashPassCoin(user_id, 0));
    let srv = /([\w-]+\.)*vkforms\.ru/;
    switch (server) {
        case 1:
            return URLWS.replace(srv, "bagosi-go-go.vkforms.ru");
        case 2:
            return URLWS.replace(srv, "coin.w5.vkforms.ru");
        case 3:
            return URLWS.replace(srv, (channel > 7) ? "bagosi-go-go.vkforms.ru" : "coin.w5.vkforms.ru");
        default:
            return URLWS.replace(srv, "coin-without-bugs.vkforms.ru");
    }
}

let State = {
    STOPPED: 1,
    LOADING: 2,
    RESTARTING: 3,
    RUNNING: 4,
    
    descr: ["???", "STOPPED", "LOADING", "RESTARTING", "RUNNING"]
}

class CoinBot {
    constructor(cfg, id=0, single=false) {
        this.vk_token = cfg.TOKEN || "";
        this.doneurl = cfg.DONEURL || "";
        this.single = single;
        this.id = id;
        
        this.transferTo = getDefault(cfg.TO, null);
        this.transferInterval = getDefault(cfg.TI, 3600);
        this.transferCoins = getDefault(cfg.TSUM, 3e4);
        this.transferPercent = getDefault(cfg.TPERC, 0);
        this.transferLastTime = 0;
        
        this.autoBuy = getDefault(cfg.AUTOBUY, false);
        this.autoBuyItems = (cfg.AUTOBUYITEMS, ["datacenter"]);
        this.smartBuy = getDefault(cfg.SMARTBUY, false);
        this.percentForSB = getDefault(cfg.PSB, 100);
        this.limitCPS = getDefault(Math.floor(cfg.LIMIT * 1000), Infinity);
        
        this.showStatus = getDefault(cfg.SHOW_STATUS, false);
        this.showTransferIn = getDefault(cfg.SHOW_T_IN, false);
        this.showTransferOut = getDefault(cfg.SHOW_T_OUT, false);
        this.showBuy = getDefault(cfg.SHOW_BUY, false);
        
        this.user_id = 0;
        this.URLWS = null;
        this.currentServer = 0;
        this.tryStartTTL = null;
        this.missCount = 0;
        this.missTTL = null;
        this.boosterTTL = null;
        this.lastTry = 0;
        this.numberOfTries = 3;
        this.state = State.STARTING;
        this.lastStatus = "";
        this.transactionInProcess = false;
        this.smartBuyItem = null;
        this.smartBuyPrice = 0;
        this.smartBuyCount = 0;

        this.miner = new Miner();
        this.coinWS = new VCoinWS();
        
        this.setupWS();
        if (this.updateLink()) {
            this.startBooster();
        }
    }
    
    beginTransaction() {
        if (this.transactionInProcess)
            return false;
        return this.transactionInProcess = true;
    }

    endTransaction() {
        this.transactionInProcess = false;
    }

    conBuyError(e) {
        let msg = e.message;
        switch (msg) {
            case "NOT_ENOUGH_COINS":
                msg = NOT_ENOUGH_COINS;
                break;
            case "ITEM NOT FOUND":
                msg = ITEM_404;
                break;
        }
        this.conId(msg, true)
    }

    lPrices() {
        let temp = "";
        temp += Entit.names.map(el => {
            return ccon("\n> [" + el + "] " + Entit.titles[el] + " (" + miner.getItemCount(el) + " -> " + (miner.getItemCount(el) + 1) + ") - " + formatScore(this.miner.getPriceForItem(el), true), this.miner.hasMoney(el) ? "green" : "red", "Black", true);
        });
        return temp;
    }
    
    justPrices() {
        return Entit.names.map(el => {
            return !this.miner.hasMoney(el) ? Infinity : this.miner.getPriceForItem(el);
        });
    }
    
    conId(message, color, colorBG) {
        con("[Bot #" + this.id + "] " + message, color, colorBG);
    }
    
    conStatus() {
        this.conId("(" + State.descr[this.state] + ") " + this.lastStatus, "yellow")
    }
    
    async infLogId(message) {
        try {
            await infLog("[Bot #" + this.id + "] " + message);
        } catch (e) {}
    }
    
    async logMisc(message, doWrite, color, colorBG) {
        let idMsg = (!this.single ? "[Bot #" + this.id + "] " : "") + message;
        if (this.single || doWrite) {
            con(idMsg, color, colorBG)
        }
        try {
            await infLog(idMsg);
        } catch (e) {}
    }
    
    conMisc(message, color, colorBG) {
        if (this.single) {
            con(message, color, colorBG)
        }
    }
    
    updateLink() {
        if (!this.doneurl) {
            if (!this.vk_token) {
                this.conId(NO_TOKEN, true);
                return this.stop();
            }
            let vk = new VK();
            vk.token = this.vk_token;
            return (async _ => {
                try {
                    let {
                        mobile_iframe_url
                    } = (await vk.api.apps.get({
                        app_id: 6915965
                    })).items[0];
                    if (!mobile_iframe_url)
                        throw ("Не удалось получить ссылку на приложение.\n\t\tВозможное решение: Используйте расширенный токен.");
    
                    let id = (await vk.api.users.get())[0]["id"];
                    if (!id)
                        throw ("Не удалось получить ID пользователя.");
    
                    this.user_id = id;
                    this.URLWS = formatWSS(mobile_iframe_url, this.user_id, this.currentServer);
                    return true;
                } catch (error) {
                    if (error.code == 5){
                        this.conId(INVALID_TOKEN, true);
                    } else if ((error.code == 'ECONNREFUSED' || error.code == 'ENOENT')) {
                        this.conId(NO_CONN, true);
                    } else {
                        this.conId('API Error: ' + error, true);
                    }
                    this.stop();
                    return false;
                }
            })();
        } else {
            let gsearch = url.parse(this.doneurl, true);
            if (!gsearch.query || !gsearch.query.vk_user_id) {
                this.conId(URL_NO_VK_ID, true);
                this.stop();
                return false;
            }
            this.user_id = parseInt(gsearch.query.vk_user_id);
    
            this.URLWS = formatWSS(this.doneurl, this.user_id, this.currentServer);
            return true;
        }
    }
    
    startBooster(tw=1e3) {
        clearTimeout(this.tryStartTTL);
        this.tryStartTTL = setTimeout(() => {
            this.state = State.STARTING;
            this.conId(STARTING);
            this.coinWS.userId = this.user_id;
            this.coinWS.run(this.URLWS, _ => {
                this.conId(STARTED);
            });
        }, tw);
    }
    
    forceRestart(t) {
        this.stop();
        this.lastStatus = "";
        this.state = State.RESTARTING;
        this.startBooster(t);
    }
    
    setupWS() {
        this.coinWS.onMissClickEvent(_ => {
            if (this.missCount === 0) {
                clearTimeout(this.missTTL);
                this.missTTL = setTimeout(_ => {
                    this.missCount = 0;
                    return;
                }, 6e4)
            }
        
            if (++this.missCount > 20)
                this.forceRestart(4e3);
        
            if (++this.missCount > 10) {
                if (autobeep)
                    beep();
                this.conId(BAD_CONN_PAUSED, true);
            }
        });
        
        this.coinWS.onReceiveDataEvent(async (place, score) => {
            this.miner.setScore(score);
            if (place > 0) {
                if (this.transferPercent) {
                    this.transferCoins = Math.floor(score / 1000 * (this.transferPercent / 100))
                }
                if (this.transferTo && (this.transferCoins * 1e3 < score || this.transferCoins * 1e3 >= 9e9) && ((Math.floor(Date.now() / 1000) - this.transferLastTime) > this.transferInterval)) {
                    await this.doAutoTransfer();
                }
        
                if (this.autoBuy && this.coinWS.tick <= this.limitCPS && score > 0) {
                    await this.doAutoBuy();
                }
        
                if (this.smartBuy && this.coinWS.tick <= this.limitCPS && score > 0) {
                    await this.doSmartBuy();
                }

                let msg = "Позиция в топе: " + place + "\tКоличество коинов: " + formatScore(score, true);
                this.lastStatus = msg;
                this.conMisc(msg, "yellow");
            }
        });
        
        this.coinWS.onTransfer(async (id, score) => {
            let template = "Пользователь @id" + this.user_id + " получил [" + formatScore(score, true) + "] коинов от @id" + id;
            this.logMisc(template, this.showTransferIn, "green", "Black");
        });
        
        this.coinWS.onUserLoaded((place, score, items, top, firstTime, tick) => {
            this.logMisc(USER_LOADED);
            this.logMisc("Скорость: " + formatScore(tick, true) + " коинов / тик.");
            
            this.miner.setActive(items);
            this.miner.updateStack(items);
        
            clearInterval(this.boosterTTL);
            this.boosterTTL = setInterval(_ => {
                rand(0, 5) > 3 && this.coinWS.click();
            }, 5e2);
            this.lastStatus = "Позиция в топе: " + place + "\tКоличество коинов: " + formatScore(score, true);
            this.state = State.RUNNING;
        });
        
        this.coinWS.onBrokenEvent(_ => {
            this.conId(BRK_EVT, true);
            if (autobeep)
                beep();
            
            this.tryAgain(1e4);
        });
        
        this.coinWS.onAlreadyConnected(_ => {
            this.conId(OTHER_DEVICE, true);
            if (autobeep)
                beep();
            this.forceRestart(3e4);
        });
        
        this.coinWS.onOffline(_ => {
            if (this.state == State.RUNNING || this.state == State.STARTING) {
                this.conId(USER_OFFLINE, true);
                if (autobeep)
                    beep();
            
                this.tryAgain(2e4);
            }
        });
    }

    async doAutoTransfer() {
        if (this.state != State.RUNNING || !this.beginTransaction())
            return;
        try {
            let scoreToTransfer = this.transferCoins * 1e3 >= 9e9 ? Math.floor(this.miner.score / 1e3) : this.transferCoins;
            this.transactionInProcess = true;
            await this.coinWS.transferToUser(this.transferTo, scoreToTransfer);
            let template = "Автоматически переведено [" + formatScore(scoreToTransfer * 1e3, true) + "] коинов от @id" + this.user_id + " к @id" + this.transferTo;
            
            this.transferLastTime = Math.floor(Date.now() / 1000);
            this.logMisc(template, this.showTransferOut, "black", "Green");
        } catch (e) {
            this.conId("Автоматический перевод не удалася. Ошибка: " + e.message, true);
        }
        this.endTransaction();
    }

    async doAutoBuy() {
        if (this.state != State.RUNNING || !this.beginTransaction())
            return;
        for (let i = 0; i < this.autoBuyItems.length; i++) {
            if (this.miner.hasMoney(this.autoBuyItems[i])) {
                try {
                    result = await this.coinWS.buyItemById(this.autoBuyItems[i]);
                    this.miner.updateStack(result.items);
                    let template = "Автоматической покупкой был приобретен " + Entit.titles[this.autoBuyItems[i]];;
                    this.logMisc(template, this.showBuy, "black", "Green");
                    this.logMisc("Новая скорость: " + formatScore(result.tick, true) + " коинов / тик.", this.showBuy);
                } catch (e) {
                    this.conBuyError(e);
                }
            }
        }
        this.endTransaction();
    }

    async doSmartBuy() {
        if (this.state != State.RUNNING)
            return;
        let ratio = 100 / this.percentForSB;
        let count = [1000, 333, 100, 34, 10, 2, 1];
        let prices = this.justPrices();
        let itemName = "";
        Object.keys(count).forEach(id => {
            prices[id] = mathPrice(prices[id], count[id]);
        });
        if (this.smartBuyItem === null){
            let min = Math.min.apply(null, prices);
            let good = prices.indexOf(min);
            this.smartBuyItem = Entit.names[good];
            this.smartBuyPrice = min;
            this.smartBuyCount = count[good];
            this.logMisc("Умной покупкой было определено, что выгодно будет приобрести улучшение " + Entit.titles[this.smartBuyItem] + ".", this.showBuy);
            this.logMisc("Стоимость: " + formatScore(min, true) + " коинов за " + count[good] + " шт.", this.showBuy);
        }

        if (Math.floor(this.miner.score * this.percentForSB / 100) > this.smartBuyPrice) {
            if (this.state != State.RUNNING || !this.beginTransaction())
                return;
            try {
                let cnt = this.smartBuyCount;
                while (cnt) {
                    try {
                        let result = await this.coinWS.buyItemById(this.smartBuyItem);
                        this.miner.updateStack(result.items);
                        cnt--;
                    } catch (e) {
                        if (e.message != "ANOTHER_TRANSACTION_IN_PROGRESS") {
                            throw e;
                        }
                    }
                }
                let template = "Умной покупкой был приобритен " + Entit.titles[this.smartBuyItem] + " в количестве " + this.smartBuyCount + " шт.";
                this.logMisc(template, this.showBuy);
            } catch (e) {
                this.conBuyError(e);
            }
            this.endTransaction();
        }
    }
    
    tryAgain(t) {
        this.lastStatus = "";
        this.state = State.RESTARTING;
        this.lastTry++;
        if (this.lastTry >= this.numberOfTries) {
            this.lastTry = 0;
            this.currentServer = (this.currentServer + 1) % TOTAL_SERVERS;
            this.conId(SWITCH_SRV, true);
            if (this.updateLink()) {
                this.startBooster(t);
            }
        } else {
            this.forceRestart(t);
        }
    }
    
    stop() {
        if (this.state == State.STOPPED)
            return;
        this.state = State.STOPPED;
        clearTimeout(this.tryStartTTL);
        clearTimeout(this.missTTL);
        clearInterval(this.boosterTTL);
        this.coinWS.close();
    }
    
    showDebug() {
        console.log("autobuy", this.autoBuy);
        console.log("smartbuy", this.smartBuy);
        console.log("limitCPS", this.limitCPS);
        console.log("transferTo", this.transferTo);
        console.log("transferCoins", this.transferCoins);
        console.log("transferInterval", this.transferInterval);
        console.log("transferLastTime", this.transferLastTime);
    }
    
    showInfo() {
        this.conId("ID пользователя: " + this.user_id.toString());
        this.conId("Текущее количество коинов: " + formatScore(this.coinWS.confirmScore, true));
        this.conId("Текущая скорость: " + formatScore(this.coinWS.tick, true) + " коинов / тик.\n");
    }
    
    getCoins() {
        return this.coinWS.confirmScore;
    }
    
    getSpeed() {
        return this.coinWS.tick;
    }
    
    start() {
        if (this.coinWS.connected)
            this.conId("VCoinX уже запущен и работает!");
        this.startBooster();
    }
    
    async buy(items) {
        if (!this.beginTransaction())
            return;
        for (let i = 0, j = items.length; i < j; i++) {
            if (!items[i])
                return;
            try {
                let result = await this.coinWS.buyItemById(items[i]);
                this.miner.updateStack(result.items);
                if (result && result.items)
                    delete result.items;
                this.conId("Новая скорость: " + formatScore(result.tick, true) + " коинов / тик.");
            } catch (e) {
                this.conBuyError(e);
            }
        }
        this.endTransaction();
    }
    
    setABItems(items) {
        for (let i = 0; i < items.length; i++) {
            if (!Entit.titles[items[i]]) 
                return this.conId("Неизвестное ускорение: " + items[i], true);
            this.conId("Для автоматической покупки установлено ускорение: " + Entit.titles[items[i]]);
        }
        this.autoBuyItems = items;
    }
    
    switchAB() {
        this.autoBuy = !this.autoBuy;
        this.smartBuy = false;
        this.conId("Автопокупка: " + (this.autoBuy ? "Включена" : "Отключена"));
        this.conId("Умная покупка: Отключена");
    }
    
    switchSB() {
        this.smartBuy = !this.smartBuy;
        this.autoBuy = false;
        this.conId("Умная покупка: " + (this.smartBuy ? "Включена" : "Отключена"));
        this.conId("Автопокупка: Отключена");
    }

    setPSB(p) {
        if (!isNaN(p)) {
            this.percentForSB = p;
            this.conId("Процент коинов для умной покупки: " + this.percentForSB + "%");
        } else {
            this.conId("Некорректное значение!", true);
        }
    }
    
    setLimit(lim){
        if (!isNaN(lim)) {
            this.limitCPS = Math.floor(lim * 1000);
            this.conId("Установлен новый лимит коинов / тик для SmartBuy & AutoBuy: " + formatScore(this.limitCPS, true));
        } else {
            this.conId("Неверное значение лимита!", true);
        }
    }
    
    setTransferTo(id) {
        this.transferTo = id;
        this.conId("Автоматический перевод коинов на @id" + this.transferTo);
    }
    
    setTI(ti) {
        this.transferInterval = ti;
        this.conId("Интервал для автоматического перевода " + this.transferInterval + " секунд.");
    }
    
    setTS(ts) {
        this.transferCoins = ts;
        this.transferPercent = 0;
        this.conId("Количество коинов для автоматического перевода " + this.transferCoins + "");
    }
    
    setTP(tp) {
        this.transferPercent = tp;
        this.conId("Процент коинов для автоматического перевода: " + this.transferPercent + "%");
    }
    
    showPrices() {
        ccon("-- Цены --", "red");
        ccon(this.lPrices(), false);
    }
    
    async transfer(id, count) {
        if (!this.beginTransaction())                                   return;
        try {
            await this.coinWS.transferToUser(id, count);
            this.conId(TRANSFER_OK, "black", "Green");
            let template = "Произведён перевод [" + formatScore(count * 1e3, true) + "] коинов от @id" + this.user_id.toString() + " к @id" + id.toString();
            this.infLogId(template);
        } catch (e) {
            this.conId(e.message == "BAD_ARGS" ? BAD_ARGS : e.message, true);
        }
        this.endTransaction();
    }
}

module.exports = {
    CoinBot,
    State
};