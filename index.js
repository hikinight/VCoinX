const url = require('url'),
    {
        VK
    } = require('vk-io');
const {
    VCoinWS,
    miner,
    Entit
} = require('./VCoinWS');
const {
    con,
    ccon,
    setColorsM,
    formatScore,
    rl,
    existsFile,
    existsAsync,
    writeFileAsync,
    appendFileAsync,
    setTerminalTitle,
    getVersion,
    infLog,
    rand,
    onUpdates,
    beep,
    mathPrice,
} = require('./helpers');
let {
    USER_ID: depUSER_ID,
    DONEURL,
    VK_TOKEN
} = existsFile('./config.js') ? require('./config.js') : {};
let USER_ID = false;
let vk = new VK();
let URLWS = false;
let boosterTTL = null,
    tryStartTTL = null,
    disableUpdates = false,
    updatesEv = false,
    updatesInterval = 60,
    updatesLastTime = 0,
    xRestart = true,
    flog = false,
    offColors = false,
    autoBuy = false,
    autoBuyItems = ["datacenter"],
    smartBuyItem = "",
    smartBuy = false,
    limitCPS = 50000,
    autobeep = false,
    hidejunk = false,
    tforce = false,
    transferTo = false,
    transferCoins = 3e4,
    transferPercent = 0,
    transferInterval = 36e2,
    transferLastTime = 0,
    lastTry = 0,
    numberOfTries = 3,
    currentServer = 0;
var tempDataUpdate = {
    "canSkip": false,
    "itemPrice": null,
    "itemName": null,
    "transactionInProcess": false,
    "percentForBuy": 100,
    "tmpPr": null,
    "onBrokenEvent": true,
};
onUpdates(msg => {
    if (!updatesEv && !disableUpdates)
        updatesEv = msg;
    con(msg, "white", "Red");
});
let vCoinWS = new VCoinWS();
let missCount = 0,
    missTTL = null;
vCoinWS.onMissClickEvent(_ => {
    if (0 === missCount) {
        clearTimeout(missTTL);
        missTTL = setTimeout(_ => {
            missCount = 0;
            return;
        }, 6e4)
    }
    if (++missCount > 20)
        forceRestart(4e3);
    if (++missCount > 10) {
        if (autobeep)
            beep();
        con("Плохое соединение с сервером, бот был приостановлен.", true);
    }
});
vCoinWS.onReceiveDataEvent(async (place, score) => {
    var n = arguments.length > 2 && void 0 !== arguments[2] && arguments[2],
        trsum = 3e6;
    miner.setScore(score);
    setTerminalTitle("VCoinX " + getVersion() + " (id" + USER_ID.toString() + ") > " + formatScore(vCoinWS.tick, true) + " cps > " + "top " + place + " > " + formatScore(score, true) + " coins.");
    if (place > 0 && !rl.isQst) {
        if (transferPercent) {
            transferCoins = Math.floor(score / 1000 * (transferPercent / 100))
        }
        if (transferTo && (transferCoins * 1e3 < score || transferCoins * 1e3 >= 9e9) && ((Math.floor(Date.now() / 1000) - transferLastTime) > transferInterval)) {
            try {
                let template;
                if (transferCoins * 1e3 >= 9e9) {
                    await vCoinWS.transferToUser(transferTo, score / 1e3);
                    template = "Автоматически переведено [" + formatScore(score * 1e3, true) + "] коинов с активного аккаунта (@id" + USER_ID + ") на @id" + transferTo;
                } else {
                    let minCoins = Math.min(score / 1000, transferCoins);
                    await vCoinWS.transferToUser(transferTo, minCoins);
                    template = "Автоматически переведено [" + formatScore(minCoins * 1e3, true) + "] коинов с активного аккаунта (@id" + USER_ID + ") на @id" + transferTo;
                }
                transferLastTime = Math.floor(Date.now() / 1000);
                con(template, "black", "Green");
                try {
                    await infLog(template);
                } catch (e) {}
            } catch (e) {
                con("Автоматический перевод не удалася. Ошибка: " + e.message, true);
            }
        }
        if (autoBuy && vCoinWS.tick <= limitCPS && score > 0) {
            for (var i = 0; i < autoBuyItems.length; i++) {
                if (miner.hasMoney(autoBuyItems[i])) {
                    try {
                        result = await vCoinWS.buyItemById(autoBuyItems[i]);
                        miner.updateStack(result.items);
                        let template = "Автоматической покупкой был приобретен " + Entit.titles[autoBuyItems[i]];;
                        ccon(template, "black", "Green");
                        con("Новая скорость: " + formatScore(result.tick, true) + " коинов / тик.");
                        try {
                            await infLog(template);
                        } catch (e) {}
                    } catch (e) {
                        if (e.message == "NOT_ENOUGH_COINS") con("Недостаточно средств для приобретения.", true);
                        else if (e.message == "ITEM NOT FOUND") con("Предмет не найден.", true);
                        else con(e.message, true);
                    }
                }
            }
        }
        if (smartBuy && vCoinWS.tick <= limitCPS && score > 0)
            smartBuyFunction(score);
        if (!disableUpdates && updatesEv && (Math.floor(Date.now() / 1000) - updatesLastTime > updatesInterval)) {
            con(updatesEv + "\n\t\t\t Введите \'hideupd(ate)\' для скрытия данного уведомления.", "white", "Red");
            updatesLastTime = Math.floor(Date.now() / 1000);
        }

        if (!hidejunk)
            con("Позиция в топе: " + place + "\tКоличество коинов: " + formatScore(score, true) + "\tСкорость: " + formatScore(vCoinWS.tick, true) + " коинов / тик.", "yellow");
    }
});
vCoinWS.onTransfer(async (id, score) => {
    let template = "Активный пользователь (@id" + USER_ID + ") получил [" + formatScore(score, true) + "] коинов от @id" + id;
    ccon(template, "green", "Black");
    try {
        await infLog(template);
    } catch (e) {
        console.error(e);
    }
});
vCoinWS.onUserLoaded((place, score, items, top, firstTime, tick) => {
    con("Пользователь успешно загружен.");
    con("Скорость: " + formatScore(tick, true) + " коинов / тик.");
    setTerminalTitle("VCoinX " + getVersion() + " (id" + USER_ID.toString() + ") > " + formatScore(tick, true) + " cps > " + "top " + place + " > " + formatScore(score, true) + " coins.");
    miner.setActive(items);
    miner.updateStack(items);
    boosterTTL && clearInterval(boosterTTL);
    boosterTTL = setInterval(_ => {
        rand(0, 5) > 3 && vCoinWS.click();
    }, 5e2);
});
vCoinWS.onBrokenEvent(_ => {
    con("Обнаружен brokenEvent, видимо сервер сломался.\n\t\tЧерез 10 секунд будет выполнен перезапуск.", true);
    setTerminalTitle("VCoinX " + getVersion() + " (id" + USER_ID.toString() + ") > " + "BROKEN");
    tempDataUpdate["onBrokenEvent"] = true;
    xRestart = false;
    if (autobeep)
        beep();
    lastTry++;
    if (lastTry >= numberOfTries) {
        lastTry = 0;
        currentServer = currentServer >= 3 ? 0 : currentServer + 1;
        con("Достигнут лимит попыток подключиться к серверу.\n\t\t\tПроизводится смена сервера...", true);
        updateLink();
    }
    forceRestart(1e4, true);
});
vCoinWS.onAlreadyConnected(_ => {
    con("Обнаружено открытие приложения с другого устройства.\n\t\tЧерез 30 секунд будет выполнен перезапуск.", true);
    setTerminalTitle("VCoinX " + getVersion() + " (id" + USER_ID.toString() + ") > " + "ALREADY_CONNECTED");
    if (autobeep)
        beep();
    forceRestart(3e4, true);
});
vCoinWS.onOffline(_ => {
    if (!xRestart) return;
    con("Пользователь отключен от сервера.\n\t\tЧерез 10 секунд будет выполнен перезапуск.", true);
    if (autobeep)
        beep();
    lastTry++;
    if (lastTry >= numberOfTries) {
        lastTry = 0;
        currentServer = currentServer >= 3 ? 0 : currentServer + 1;
        con("Достигнут лимит попыток подключиться к серверу.\n\t\t\tПроизводится смена сервера...", true);
        updateLink();
    }
    setTerminalTitle("VCoinX " + getVersion() + " (id" + USER_ID.toString() + ") > " + "OFFLINE");
    forceRestart(2e4, true);
});
async function startBooster(tw) {
    tryStartTTL && clearTimeout(tryStartTTL);
    tryStartTTL = setTimeout(() => {
        con("VCoinX загружается...");
        vCoinWS.userId = USER_ID;
        vCoinWS.run(URLWS, _ => {
            con("VCoinX загружен...");
            xRestart = true;
        });
    }, (tw || 1e3));
}

function forceRestart(t, force) {
    vCoinWS.close();
    boosterTTL && clearInterval(boosterTTL);
    setTerminalTitle("VCoinX " + getVersion() + " (id" + USER_ID.toString() + ") > " + "RESTARTING");
    if (xRestart || force)
        startBooster(t);
}

function lPrices(d) {
    let temp;
    temp = Entit.names.map(el => {
        return !miner.hasMoney(el) && d ? "" : "\n> [" + el + "] " + Entit.titles[el] + " (" + miner.getItemCount(el) + " > " + (miner.getItemCount(el) + 1) + ") - " + formatScore(miner.getPriceForItem(el)) + " коинов";
    }).toString();
    return temp;
}

function justPrices(d) {
    temp = Entit.names.map(el => {
        return !miner.hasMoney(el) && d ? "" : miner.getPriceForItem(el);
    });
    return temp;
}
rl.on('line', async (line) => {
    if (!URLWS) return;
    let temp, item;
    switch (line.trim().toLowerCase()) {
        case '':
            break;
        case 'debuginformation':
        case 'debuginfo':
        case 'debug':
            console.log("updatesInterval", updatesInterval);
            console.log("updatesLastTime", updatesLastTime);
            console.log("xRestart", xRestart);
            console.log("autobuy", autoBuy);
            console.log("smartbuy", smartBuy);
            console.log("transferTo", transferTo);
            console.log("transferCoins", transferCoins);
            console.log("transferInterval", transferInterval);
            console.log("transferLastTime", transferLastTime);
            break;
        case 'i':
        case 'info':
            con("Текущая версия бота: " + getVersion());
            con("ID авторизованного пользователя: " + USER_ID.toString());
            con("Текущее количество коинов: " + formatScore(vCoinWS.confirmScore, true));
            con("Текущая скорость: " + formatScore(vCoinWS.tick, true) + " коинов / тик.\n");
            break;
        case 'color':
            setColorsM(offColors = !offColors);
            con("Цвета " + (offColors ? "от" : "в") + "ключены. (*^.^*)", "blue");
            break;
        case "hu":
        case "hideupd":
        case "hideupdate":
            con("Уведомления об обновлении " + (!disableUpdates ? "скрыт" : "показан") + "ы. (*^.^*)");
            disableUpdates = !disableUpdates;
            break;
        case "stop":
        case "pause":
            xRestart = false;
            vCoinWS.close();
            break;
        case "start":
        case "run":
            if (vCoinWS.connected)
                return con("VCoinX уже запущен и работает!");
            xRestart = true;
            startBooster();
            break;
        case 'b':
        case 'buy':
            temp = lPrices(true);
            ccon("-- Доступные ускорения и их цены --", "red");
            ccon(temp);
            item = await rl.questionAsync("Введи название ускорения [cursor, cpu, cpu_stack, computer, server_vk, quantum_pc, datacenter]: ");
            var array = item.split(" ");
            for (var i = 0, j = array.length; i < j; i++) {
                if (!array[i]) return;
                let result;
                try {
                    result = await vCoinWS.buyItemById(array[i]);
                    miner.updateStack(result.items);
                    if (result && result.items)
                        delete result.items;
                    con("Новая скорость: " + formatScore(result.tick, true) + " коинов / тик.");
                } catch (e) {
                    if (e.message == "NOT_ENOUGH_COINS") con("Недостаточно средств для приобретения.", true);
                    else if (e.message == "ITEM NOT FOUND") con("Предмет не найден.", true);
                    else con(e.message, true);
                }
            }
            break;
        case 'autobuyitem':
            item = await rl.questionAsync("Введи название ускорения для автоматической покупки [cursor, cpu, cpu_stack, computer, server_vk, quantum_pc, datacenter]: ");
            var array = item.split(" ");
            for (var i = 0; i < array.length; i++) {
                if (!item || !Entit.titles[array[i]]) return;
                con("Для автоматической покупки установлено ускорение: " + Entit.titles[array[i]]);
            }
            autoBuyItems = array;
            break;
        case 'ab':
        case 'autobuy':
            autoBuy = !autoBuy;
            con("Автопокупка: " + (autoBuy ? "Включена" : "Отключена"));
            smartBuy = false;
            con("Умная покупка: " + (smartBuy ? "Включена" : "Отключена"));
            break;
        case 'sb':
        case 'smartbuy':
            smartBuy = !smartBuy;
            con("Умная покупка: " + (smartBuy ? "Включена" : "Отключена"));
            autoBuy = false;
            con("Автопокупка: " + (autoBuy ? "Включена" : "Отключена"));
            break;
        case 'setcps':
        case 'scp':
        case 'sl':
        case 'setlimit':
            item = await rl.questionAsync("Введите новый лимит коинов / тик для SmartBuy & AutoBuy: ");
            limitCPS = parseInt(item.replace(/,/g, ''));
            con("Установлен новый лимит коинов / тик для SmartBuy & AutoBuy: " + formatScore(limitCPS, true));
            break;
        case 'to':
            item = await rl.questionAsync("Введите ID пользователя: ");
            transferTo = parseInt(item.replace(/\D+/g, ""));
            con("Автоматический перевод коинов на vk.com/id" + transferTo);
            break;
        case 'ti':
            item = await rl.questionAsync("Введите интервал: ");
            transferInterval = parseInt(item);
            con("Интервал для автоматического перевода " + transferInterval + " секунд.");
            break;
        case 'tsum':
            item = await rl.questionAsync("Введите сумму: ");
            transferCoins = parseInt(item);
            con("Количество коинов для автоматического перевода " + transferCoins + "");
            break;
        case 'tperc':
            item = await rl.questionAsync("Введите процент: ");
            transferPercent = parseInt(item);
            con("Процент коинов для автоматического перевода: " + transferPercent + "%");
            break;
        case 'autobeep':
        case 'beep':
            autobeep = !autobeep;
            con("Автоматическое проигрывание звука при ошибках " + autobeep ? "включено" : "отключено" + ".");
            break;
        case 'p':
        case 'price':
        case 'prices':
            temp = lPrices(false);
            ccon("-- Цены --", "red");
            ccon(temp);
            break;
        case 'tran':
        case 'transfer':
            let count = await rl.questionAsync("Количество: ");
            let id = await rl.questionAsync("ID получателя: ");
            let conf = await rl.questionAsync("Вы уверены? [yes]: ");
            id = parseInt(id.replace(/\D+/g, ""));
            if (conf.toLowerCase() != "yes".replace(/[^a-zA-Z ]/g, "") || !id || !count) return con("Отправка не была произведена, вероятно, один из параметров не был указан.", true);
            try {
                await vCoinWS.transferToUser(id, count);
                let template = "Успешно была произведена отпрвка [" + formatScore(count * 1e3, true) + "] коинов от активного аккаунта (@id" + USER_ID.toString() + ") для @id" + id.toString();
                con(template, "black", "Green");
                try {
                    await infLog(template);
                } catch (e) {}
            } catch (e) {
                if (e.message == "BAD_ARGS") con("Вероятно, вы где-то указали неверный аргумент.", true);
                else con(e.message, true);
            }
            break;
        case 'psb':
        case 'pfsb':
        case 'percforsmartbuy':
        case 'percentforsmartbuy':
            var proc = await rl.questionAsync("Введи процентное соотношение, выделяемое под SmartBuy: ");
            if (parseInt(proc))
                if (parseInt(proc) > 0 && parseInt(proc) <= 100) {
                    tempDataUpdate["percentForBuy"] = parseInt(proc);
                    tempDataUpdate["tmpPr"] = null;
                    tempDataUpdate["canSkip"] = false;
                }
            break;
        case "?":
        case "help":
            ccon("-- VCoinX --", "red");
            ccon("info - отображение основной информации.");
            ccon("debug - отображение тестовой информации.");
            ccon("stop(pause)	- остановка майнера.");
            ccon("start(run)	- запуск майнера.");
            ccon("(b)uy	- покупка улучшений.");
            ccon("(p)rice - отображение цен на товары.");
            ccon("tran(sfer)	- перевод игроку.");
            ccon("hideupd(ate) - скрыть уведомление об обновлении.");
            ccon("to - указать ID и включить авто-перевод средств на него.");
            ccon("ti - указать интервал для авто-перевода (в секундах).");
            ccon("tsum - указать сумму для авто-перевода (без запятой).");
            ccon("autobuy - изменить статус авто-покупки.");
            ccon("autobuyitem - указать предмет(ы) для авто-покупки.");
            ccon("setlimit(sl) - установить лимит коинов / тик, до которого будет рабоать авто и умная покупка.");
            ccon("smartbuy - изменить статус умной покупки.")
            ccon("percentforsmartbuy - процент средств, выделяемый для приобретений улучшений с помощью умной покупки.");
            ccon("color - изменить цветовую схему консоли.");
            break;
    }
});
for (var argn = 2; argn < process.argv.length; argn++) {
    let cTest = process.argv[argn],
        dTest = process.argv[argn + 1];
    switch (cTest.trim().toLowerCase()) {
        case '-black':
            {
                flog && con("Цвета отключены (*^.^*)", "blue");
                setColorsM(offColors = !offColors);
                break;
            }
        case '-t':
            {
                if (dTest.length > 80 && dTest.length < 90) {
                    VK_TOKEN = dTest.toString();
                    con("Успешно установлен токен: " + VK_TOKEN.toString() + ".", "blue");
                    argn++;
                }
                break;
            }
        case '-u':
            {
                if (dTest.length > 200 && dTest.length < 512) {
                    DONEURL = dTest;
                    argn++;
                }
                break;
            }
        case '-to':
            {
                if (dTest.length > 1 && dTest.length < 11) {
                    transferTo = parseInt(dTest.replace(/\D+/g, ""));
                    con("Включен автоматический перевод коинов на @id" + transferTo);
                    argn++;
                }
                break;
            }
        case '-autobuyitem':
            {
                if (typeof dTest == "string" && dTest.length > 1 && dTest.length < 20) {
                    if (!Entit.titles[dTest]) return;
                    con("Для автопокупки выбрано: " + Entit.titles[dTest]);
                    autoBuyItem = dTest;
                    argn++;
                }
                break;
            }
        case '-tforce':
            {
                tforce = true;
                break;
            }
        case '-tsum':
            {
                if (dTest.length >= 1 && dTest.length < 10) {
                    transferCoins = parseInt(dTest);
                    argn++;
                }
                break;
            }
        case '-tperc':
        case '-tpercent':
            {
                if (dTest.length >= 1 && dTest.length < 10) {
                    transferPercent = parseInt(dTest);
                    argn++;
                }
                break;
            }
        case '-ti':
            {
                if (dTest.length >= 1 && dTest.length < 10) {
                    transferInterval = parseInt(dTest);
                    argn++;
                }
                break;
            }
        case '-flog':
            {
                flog = true;
                break;
            }
        case '-autobuy':
            {
                autoBuy = true;
                smartBuy = false;
                break;
            }
        case '-smartbuy':
            {
                if (parseInt(dTest)) {
                    if (parseInt(dTest) > 0 && parseInt(dTest) <= 100) tempDataUpdate["percentForBuy"] = parseInt(dTest);
                }
                smartBuy = true;
                autoBuy = false;
                break;
            }
        case '-sl':
        case '-setlimit':
            {
                if (dTest.length >= 1 && dTest.length < 10) {
                    limitCPS = parseInt(dTest);
                    argn++;
                }
                break;
            }
        case '-ab':
        case '-autobeep':
            {
                autobeep = true;
                break;
            }
        case '-h':
        case '-help':
            {
                ccon("-- VCoinB arguments --", "red");
                ccon("-help			- помощь.");
                ccon("-flog			- подробные логи.");
                ccon("-tforce		- принудительно использовать токен.");
                ccon("-tsum [sum]	- включить функцию для авто-перевода.");
                ccon("-to [id]		- указать ID для авто-перевода.");
                ccon("-ti [seconds]	- установить инетрвал для автоматического перевода.");
                ccon("-u [URL]		- задать ссылку.");
                ccon("-t [TOKEN]	- задать токен.");
                ccon("-black      - отключить цвета консоли.");
                ccon("-noupdates  - отключить сообщение об обновлениях.");
                process.exit();
                continue;
            }
        default:
            con('Unrecognized param: ' + cTest + ' (' + dTest + ') ');
            break;
    }
}

async function smartBuyFunction(score) {
    if (tempDataUpdate["tmpPr"] == null) {
        tempDataUpdate["tmpPr"] = 100 / tempDataUpdate["percentForBuy"];
    }
    if (!tempDataUpdate["transactionInProcess"] && !tempDataUpdate["onBrokenEvent"]) {
        var names = ["cursor", "cpu", "cpu_stack", "computer", "server_vk", "quantum_pc", "datacenter"];
        var count = [1000, 333, 100, 34, 10, 2, 1];
        if (!tempDataUpdate["canSkip"]) {
            var prices = justPrices();
            Object.keys(count).forEach(function(id) {
                prices[id] = mathPrice(prices[id], count[id]);
            });
            min = Math.min.apply(null, prices);
            good = prices.indexOf(min);
            canBuy = names[good];
            con("Умной покупкой было проанилизировано, что выгодно будет приобрести улучшение " + Entit.titles[canBuy] + ".", "green", "Black");
            con("Стоимость: " + formatScore(min, true) + " коинов за " + count[good] + " шт.", "green", "Black");
        } else {
            min = tempDataUpdate["itemPrice"];
            canBuy = tempDataUpdate["itemName"];
        }
        if ((score - min * tempDataUpdate["tmpPr"]) > 0) {
            tempDataUpdate["canSkip"] = false;
            tempDataUpdate["transactionInProcess"] = true;
            try {
                var countBuy = count[names.indexOf(canBuy)];
                while (countBuy) {
                    try {
                        result = await vCoinWS.buyItemById(canBuy);
                        miner.updateStack(result.items);
                        countBuy--;
                    } catch (e) {
                        if (!e.message == "ANOTHER_TRANSACTION_IN_PROGRESS") {
                            throw e;
                            tempDataUpdate["transactionInProcess"] = false;
                            break;
                        }
                    }
                }
                let template = "Умной покупкой был приобритен " + Entit.titles[canBuy] + " в количестве " + count[names.indexOf(canBuy)] + " шт.";
                tempDataUpdate["transactionInProcess"] = false;
                con(template, "green", "Black");
                try {
                    await infLog(template);
                } catch (e) {}
            } catch (e) {
                if (e.message == "NOT_ENOUGH_COINS") con("Недостаточно средств для покупки " + Entit.titles[canBuy] + "a", true);
                else con(e.message, true);
            }
        } else {
            tempDataUpdate["canSkip"] = true;
            tempDataUpdate["itemPrice"] = min;
            tempDataUpdate["itemName"] = canBuy;
        }
    }
    tempDataUpdate["onBrokenEvent"] = false;
}

function updateLink() {
    if (!DONEURL || tforce) {
        if (!VK_TOKEN) {
            con("Отсутствует токен. Информация о его получении расположена на -> github.com/cursedseal/VCoinX", true);
            return process.exit();
        }
        (async function inVKProc(token) {
            vk.token = token;
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
                USER_ID = id;
                formatWSS(mobile_iframe_url);
                startBooster();
            } catch (error) {
                if (error.code && error.code == 5)
                    ccon('Указан некорректный токен пользователя! Перепроверьте токен или получите новый, как указано в данном руководстве -> github.com/cursedseal/VCoinX', true, true, false);
                else if (error.code && (error.code == 'ECONNREFUSED' || error.code == 'ENOENT'))
                    ccon('Не удалось подключиться API! Попробуйте перезагрузить роутер или установить VPN.', true, true, false);
                else
                    console.error('API Error:', error);
                process.exit();
            }
        })(VK_TOKEN);
    } else {
        let GSEARCH = url.parse(DONEURL, true);
        if (!GSEARCH.query || !GSEARCH.query.vk_user_id) {
            con("При анализе ссылки не был найден vk_user_id.", true);
            return process.exit();
        }
        USER_ID = parseInt(GSEARCH.query.vk_user_id);
        formatWSS(DONEURL);
        startBooster();
    }
}
updateLink();

function formatWSS(LINK) {
    let GSEARCH = url.parse(LINK),
        NADDRWS = GSEARCH.protocol.replace("https:", "wss:").replace("http:", "ws:") + "//" + GSEARCH.host + "/channel/",
        CHANNEL = USER_ID % 32;
    URLWS = NADDRWS + CHANNEL + "/" + GSEARCH.search + "&ver=1&pass=".concat(Entit.hashPassCoin(USER_ID, 0));
    switch (currentServer) {
        case 1:
            URLWS = URLWS.replace(/([\w-]+\.)*vkforms\.ru/, "bagosi-go-go.vkforms.ru");
            break;
        case 2:
            URLWS = URLWS.replace(/([\w-]+\.)*vkforms\.ru/, "coin.w5.vkforms.ru");
            break;
        case 3:
            URLWS = URLWS.replace(/([\w-]+\.)*vkforms\.ru/, (CHANNEL > 7) ? "bagosi-go-go.vkforms.ru" : "coin.w5.vkforms.ru");
            break;
        default:
            URLWS = URLWS.replace(/([\w-]+\.)*vkforms\.ru/, "coin-without-bugs.vkforms.ru");
            break;
    }

    flog && console.log("formatWSS: ", URLWS);
    return URLWS;
}
