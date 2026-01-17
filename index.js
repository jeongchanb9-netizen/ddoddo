const express = require('express');
const app = express();

const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const { Guilds, GuildMessages, MessageContent } = GatewayIntentBits;

const client = new Client({
  intents: [Guilds, GuildMessages, MessageContent],
});

const DATA_FILE = './data.json';
const RECORD_FILE = './record.json';

/* ================= 데이터 로드 ================= */
let users = {};
if (fs.existsSync(DATA_FILE)) {
  users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

let bestRecord = {
  username: '없음',
  itemName: '없음',
  level: 0,
};

if (fs.existsSync(RECORD_FILE)) {
  bestRecord = JSON.parse(fs.readFileSync(RECORD_FILE, 'utf8'));
}

/* ================= 저장 함수 ================= */
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

function saveRecord() {
  fs.writeFileSync(RECORD_FILE, JSON.stringify(bestRecord, null, 2));
}

/* ================= 강화 확률 감소 ================= */
function getChanceDecrease(level) {
  if (level < 10) return 5;
  if (level < 20) return 3;
  if (level < 30) return 2;
  return 1;
}

/* ================= 판매 시세 ================= */
let marketRate = 1.0;

function updateMarketRate() {
  const r = Math.random();

  if (r < 0.6) {
    marketRate = 0.8;      // 60%
  } else if (r < 0.85) {
    marketRate = 1.0;      // 25%
  } else if (r < 0.97) {
    marketRate = 1.5;      // 12%
  } else {
    marketRate = 2.5;      // 3%
  }

  console.log(`📉📈 시세 변동: x${marketRate}`);
}


/* ================= 판매 가격 ================= */
function getSellPrice(level) {
  const BASE_PRICE = 350;
  const MULTIPLIER = 1.5;

  const baseValue = BASE_PRICE * Math.pow(MULTIPLIER, level);
  return Math.floor(baseValue * marketRate);
}

/* ================= 봇 준비 ================= */
client.once('ready', () => {
  console.log(client.user.tag + ' 준비 완료!');
  updateMarketRate();
  setInterval(updateMarketRate, 30 * 60 * 1000);
});

/* ================= 메시지 처리 ================= */
client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const content = message.content.trim();
  const args = content.split(' ');
  const command = args.shift();

  if (!users[userId]) {
    users[userId] = {
      gold: 10000,
      items: {},
      lastAttendance: null,
      username: message.author.username,
    };
  }

  users[userId].username = message.author.username;

  if (!content.startsWith('-')) {
    users[userId].gold += 10;
    saveData();
  }

  const today = new Date().toISOString().slice(0, 10);

  /* ===== 출석 ===== */
  if (command === '-출석') {
    if (users[userId].lastAttendance === today) {
      return message.reply('❌ 오늘은 이미 출석을 했습니다.');
    }

    users[userId].lastAttendance = today;
    users[userId].gold += 1000;
    saveData();
    return message.reply('💰 출석 완료! 1000 골드를 획득했습니다.');
  }

  /* ===== 지갑 ===== */
  if (command === '-지갑') {
    return message.reply(`💰 현재 보유 골드: ${users[userId].gold}`);
  }

  /* ===== 강화 ===== */
  if (command === '-강화') {
    const itemName = args.join(' ');
    if (!itemName) return message.reply('❗ 강화할 물품 이름을 입력해주세요.');

    const COST = 50;
    if (users[userId].gold < COST) {
      return message.reply(`❌ 골드가 부족합니다. (필요 골드: ${COST})`);
    }

    if (!users[userId].items[itemName]) {
      users[userId].items[itemName] = { level: 0, chance: 80 };
    }

    const item = users[userId].items[itemName];
    users[userId].gold -= COST;

    if (Math.random() * 100 <= item.chance) {
      item.level++;
      item.chance = Math.max(1, item.chance - getChanceDecrease(item.level));

      if (item.level > bestRecord.level) {
        bestRecord = {
          username: message.author.username,
          itemName,
          level: item.level,
        };
        saveRecord();
      }

      saveData();
      return message.reply(
        `✨ 강화 성공!\n🗡️ ${itemName} → +${item.level}\n🎯 성공 확률: ${item.chance}%`
      );
    } else {
      users[userId].items[itemName] = { level: 0, chance: 80 };
      saveData();
      return message.reply(`💥 ${itemName}이 파괴되었습니다.`);
    }
  }

  /* ===== 정보 ===== */
  if (command === '-정보') {
    const itemName = args.join(' ');
    const item = users[userId].items[itemName];
    if (!item) return message.reply(`❌ ${itemName}은(는) 강화 기록이 없습니다.`);

    const sellPrice =
      item.level >= 5 ? getSellPrice(item.level) : '5강 이상부터 판매 가능';

    return message.reply(
      `📊 ${itemName} 정보\n` +
      `🗡️ 강화 단계: +${item.level}\n` +
      `🎯 성공 확률: ${item.chance}%\n` +
      `💸 판매 가격: ${sellPrice}`
    );
  }

  /* ===== 랭킹 ===== */
if (command === '-랭킹') {
  let currentBest = {
    username: '없음',
    itemName: '없음',
    level: 0,
  };

  for (const uid in users) {
    for (const itemName in users[uid].items) {
      const item = users[uid].items[itemName];
      if (item.level > currentBest.level) {
        currentBest = {
          username: users[uid].username,
          itemName,
          level: item.level,
        };
      }
    }
  }

  return message.reply(
    `🏆 **역대 최고 강화 기록**\n` +
    `👤 ${bestRecord.username}\n` +
    `🗡️ ${bestRecord.itemName} (+${bestRecord.level})\n\n` +
    `⭐ **현재 서버 최고 강화 아이템**\n` +
    `👤 ${currentBest.username}\n` +
    `🗡️ ${currentBest.itemName} (+${currentBest.level})`
  );
}


  /* ===== 판매 ===== */
  if (command === '-판매') {
    const itemName = args.join(' ');
    if (!itemName) return message.reply('❗ 판매할 물품 이름을 입력해주세요.');

    const item = users[userId].items[itemName];
    if (!item) return message.reply(`❌ ${itemName}은(는) 보유하고 있지 않습니다.`);
    if (item.level < 5) return message.reply('❌ 5강 이상 아이템만 판매할 수 있습니다.');

    const price = getSellPrice(item.level);
    users[userId].gold += price;
    delete users[userId].items[itemName];

    saveData();

    return message.reply(
      `💸 판매 완료!\n🗡️ ${itemName} (+${item.level})\n📈 시세 x${marketRate}\n💰 획득 골드: ${price}`
    );
  }

  /* ===== 시세 ===== */
  if (command === '-시세') {
    return message.reply(
      `📊 현재 판매 시세\n📈 배율: x${marketRate}\n⏱️ 30분마다 자동 변동`
    );
  }

  /* ===== 도움 ===== */
  if (command === '-도움') {
    return message.reply(
      `📖 명령어 안내\n\n` +
      `💰 돈\n-출석 / -지갑 / 채팅 1회당 10골드\n\n` +
      `⚔️ 강화\n-강화 [아이템]\n-정보 [아이템]\n\n` +
      `💸 판매\n-판매 [아이템] (5강 이상)\n-시세\n\n` +
      `🏆 랭킹\n-랭킹`
    );
  }
});
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    bot: client.user ? client.user.tag : 'starting',
    time: new Date().toISOString(),
  });
});


app.listen(PORT, () => {
  console.log(`🌐 Web server listening on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Discord 로그인 성공'))
  .catch(err => {
    console.error('❌ Discord 로그인 실패:', err);
  });



