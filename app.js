// app.js - AXP Final Edition: 4-Character Smart Cropping & Layered UI

// ==========================================
// 🛡️ AXP 商業防護：網域鎖定 (防盜連)
// ==========================================
const allowedDomains = [
    "localhost", 
    "127.0.0.1", 
    "axp-vision.github.io", 
    "rabbit-turtle-m792.squarespace.com" 
];

if (!allowedDomains.includes(window.location.hostname)) {
    document.body.innerHTML = `<h2 style="color:#e74c3c; text-align:center; margin-top:20vh; font-family:Arial;">⚠️ 未經授權的使用 (Unauthorized Access)</h2><p style="color:#7f8c8d; text-align:center;">此視覺訓練工具僅限 AXP 官方授權網域使用。</p>`;
    throw new Error("Domain Security Check Failed."); 
}

const container = document.getElementById('canvas-container');
container.innerHTML = ''; 

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
container.appendChild(canvas);

const GAME_WIDTH = 600;
const GAME_HEIGHT = 800;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;
canvas.style.display = 'block';
canvas.style.margin = '0 auto';
canvas.style.backgroundColor = '#f8fafc';

function resizeCanvas() {
    const scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT) * 0.95;
    canvas.style.width = `${GAME_WIDTH * scale}px`;
    canvas.style.height = `${GAME_HEIGHT * scale}px`;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

// ==========================================
// 📦 遊戲資產管理 (精簡化：只讀取 4 張全身圖)
// ==========================================
const assets = {};

const initGameAssets = () => {
    return new Promise((resolve) => {
        let loaded = 0;
        const imagesToLoad = {
            sprite_female1: 'sprite_female1.png',
            sprite_female2: 'sprite_female2.png',
            sprite_male1: 'sprite_male1.png',
            sprite_male2: 'sprite_male2.png'
        };
        const total = Object.keys(imagesToLoad).length;

        if (total === 0) resolve();

        for (const key in imagesToLoad) {
            const img = new Image();
            img.onload = () => {
                assets[key] = img;
                loaded++;
                if (loaded === total) resolve();
            };
            img.onerror = () => {
                console.warn(`資產讀取提示: 暫未讀取到 ${imagesToLoad[key]}，請確保已放入專案資料夾。`);
                loaded++;
                if (loaded === total) resolve();
            };
            img.src = imagesToLoad[key];
        }
    });
};

// ==========================================
// ⚙️ Core System & 狀態管理
// ==========================================
const STATE = { START: 0, PLAYING: 1, PAUSED: 2, GAMEOVER: 3, LEADERBOARD: 4 };
let gameState = STATE.START;

// 🌟 UI 分頁與選擇狀態
let isTwoPlayer = false;
let sel1P = 1; // 1: 貓影, 2: 灰髮, 3: 緋紅, 4: 藍髮
let sel2P = 5; // 5: 貓影+灰髮, 6: 緋紅+藍髮, 7: 雙女(貓+緋), 8: 雙男(灰+藍)
let gameMode = 1; 

let p1CharType = 'sprite_female1';
let p2CharType = 'sprite_male1';

function getLeaderboard() {
    try { return JSON.parse(localStorage.getItem('AXP_Leaderboard')) || []; } 
    catch (e) { return []; }
}

function saveToLeaderboard(name, floors) {
    let lb = getLeaderboard();
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    lb.push({ name, floors, date: dateStr });
    lb.sort((a, b) => b.floors - a.floors);
    lb = lb.slice(0, 10); 
    try { localStorage.setItem('AXP_Leaderboard', JSON.stringify(lb)); } 
    catch (e) { console.warn("無法儲存排行榜資料"); }
}

const CONFIG = { START_SPEED: 1.5, MAX_SPEED: 4.0, SPEED_STEP: 0.2, GAP_DISTANCE: 165 };
let currentPlatformSpeed = CONFIG.START_SPEED;

const GRAVITY = 0.4; const MAX_FALL_SPEED = 9.0; const MAX_MOVE_SPEED = 7.0; const MOVE_ACCEL = 1.5; const FRICTION = 0.85;

let floorCount = 1; let platforms = []; let keys = {}; let bgOffsetY = 0;
const TYPE = { NORMAL: 0, SPIKE: 1, BELT_LEFT: 2, BELT_RIGHT: 3, BONUS: 4, SPEED_UP: 5, SPEED_DOWN: 6 };

// ==========================================
// 🎨 渲染繪圖函式 
// ==========================================

function drawPixelHeart(ctx, x, y, size, isFull) {
    const scaledSize = size * 1.5; 
    ctx.save(); ctx.translate(x, y); ctx.scale(scaledSize, scaledSize);
    ctx.fillStyle = isFull ? '#e74c3c' : '#f1f2f6'; ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-5, 0, -10, 5, 0, 15); ctx.bezierCurveTo(10, 5, 5, 0, 0, 5); ctx.fill(); ctx.stroke();
    if(isFull) { ctx.fillStyle = '#ff7675'; ctx.beginPath(); ctx.arc(-3, 6, 1.5, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();
}

// 🌟 動態解析與尺寸補正引擎
function drawFriendlyCharacter(ctx, x, y, spriteKey, facingRight, animFrame, isDead, damageCooldown) {
    if (isDead || (damageCooldown > 0 && Math.floor(Date.now() / 50) % 2 === 0)) return;
    const img = assets[spriteKey];
    if (!img) return; 

    ctx.save(); ctx.translate(x, y); 
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(0, 20, 14, 4, 0, 0, Math.PI*2); ctx.fill();

    let fw, fh, sx, sy, numFrames, yOffset = 0, scaleMultiplier = 1, scaleX = 1;
    const is9x6Format = (img.width / img.height) > 1.2;

    if (!is9x6Format) {
        // 女角 4x4 格式
        fw = img.width / 4; fh = img.height / 4; numFrames = 4;
        const fIdx = Math.floor(animFrame / 15) % numFrames;
        sx = fIdx * fw; sy = 2 * fh; 
        
        yOffset = -5; // 浮空補正
        scaleMultiplier = 1.2; // 放大補正
        
        if (!facingRight) scaleX = -1;
    } else {
        // 男角 9x6 格式
        fw = img.width / 9; fh = img.height / 6; numFrames = 3;
        const fIdx = Math.floor(animFrame / 15) % numFrames;
        sx = fIdx * fw; sy = 0 * fh; 
        
        yOffset = -12; // 浮空補正
        scaleX = facingRight ? -1 : 1; 
    }

    ctx.scale(scaleX, 1);
    const baseWidth = 32; const baseHeight = 48;
    const playerWidth = baseWidth * scaleMultiplier;
    const playerHeight = baseHeight * scaleMultiplier;
    const dx = -playerWidth / 2;
    const dy = -playerHeight / 2 + yOffset; 
    
    ctx.imageSmoothingEnabled = false; 
    ctx.drawImage(img, sx, sy, fw, fh, dx, dy, playerWidth, playerHeight);
    ctx.restore();
}

function drawPremiumPlatform(ctx, x, y, w, h, type, timeOffset) {
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.roundRect(x, y + 4, w, h, 6); ctx.fill();
    ctx.beginPath(); if (type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) { ctx.arc(x + h/2, y + h/2, h/2, Math.PI/2, Math.PI*1.5); ctx.lineTo(x + w - h/2, y); ctx.arc(x + w - h/2, y + h/2, h/2, Math.PI*1.5, Math.PI/2); } else { ctx.roundRect(x, y, w, h, 6); } ctx.closePath();
    const grad = ctx.createLinearGradient(x, y, x, y + h); grad.addColorStop(0, '#f1f5f9'); grad.addColorStop(0.3, '#e2e8f0'); grad.addColorStop(1, '#64748b'); ctx.fillStyle = grad; ctx.fill(); ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; if (type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) { ctx.beginPath(); ctx.arc(x + h/2, y + h/2, h/2 - 1, Math.PI/2, Math.PI*1.5); ctx.lineTo(x + w - h/2, y + 1); ctx.arc(x + w - h/2, y + h/2, h/2 - 1, Math.PI*1.5, Math.PI/2); ctx.closePath(); ctx.stroke(); } else { ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); } ctx.restore();
    if (type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) {
        ctx.save(); ctx.clip(); ctx.fillStyle = type === TYPE.BELT_LEFT ? 'rgba(52, 152, 219, 0.2)' : 'rgba(155, 89, 182, 0.2)'; ctx.fillRect(x, y, w, h); const dir = type === TYPE.BELT_LEFT ? 'left' : 'right';
        for (let i = -20; i < w + 40; i += 45) { const shift = type === TYPE.BELT_LEFT ? (i - timeOffset * 12) % (w + 40) : (i + timeOffset * 12) % (w + 40); const drawX = shift < -20 ? w + 40 + shift : shift; ctx.save(); ctx.translate(x + drawX, y + h/2); if (dir === 'left') ctx.scale(-1, 1); ctx.fillStyle = dir === 'left' ? '#2980b9' : '#8e44ad'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(2, 6); ctx.lineTo(2, -6); ctx.closePath(); ctx.fill(); ctx.fillRect(-2, -3, 2, 6); ctx.fillRect(-6, -3, 2, 6); ctx.restore(); } ctx.restore();
    }
    const rx1 = x + (type===TYPE.BELT_LEFT||type===TYPE.BELT_RIGHT ? h/2 : 12); const rx2 = x + w - (type===TYPE.BELT_LEFT||type===TYPE.BELT_RIGHT ? h/2 : 12); ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(rx1, y+h/2, 2.5, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(rx2, y+h/2, 2.5, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(rx1 - 0.5, y+h/2 - 0.5, 1, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(rx2 - 0.5, y+h/2 - 0.5, 1, 0, Math.PI*2); ctx.fill(); ctx.restore();
}

function drawSpikes(ctx, x, y, w) {
    for (let i = 0; i < w; i += 16) { const spikeW = Math.min(16, w - i); const sx = x + i; const grad = ctx.createLinearGradient(sx, y, sx + spikeW, y); grad.addColorStop(0, '#94a3b8'); grad.addColorStop(0.5, '#f8fafc'); grad.addColorStop(1, '#475569'); ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + spikeW/2, y - 24); ctx.lineTo(sx + spikeW, y); ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx + spikeW/2, y - 24); ctx.lineTo(sx + spikeW/2, y); ctx.stroke(); }
}

function drawSpeedArrows(ctx, x, y, type) {
    ctx.save(); ctx.strokeStyle = type === TYPE.SPEED_UP ? '#e74c3c' : '#0984e3'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; for (let i = -15; i <= 15; i += 15) { ctx.beginPath(); if (type === TYPE.SPEED_UP) { ctx.moveTo(x + i - 6, y + 4); ctx.lineTo(x + i, y - 6); ctx.lineTo(x + i + 6, y + 4); } else { ctx.moveTo(x + i - 6, y - 6); ctx.lineTo(x + i, y + 4); ctx.lineTo(x + i + 6, y - 6); } ctx.stroke(); } ctx.restore();
}

// ==========================================
// 玩家類別
// ==========================================
class Player {
    constructor(id, controls) {
        this.id = id; this.controls = controls; this.width = 32; this.height = 48; 
        this.startX = id === '1P' ? GAME_WIDTH/2 - 60 : GAME_WIDTH/2 + 60; this.reset(true);
    }
    reset(fullReset = false) {
        if (fullReset) this.revivesLeft = 3; 
        this.x = (gameMode === 1 && this.id === '1P') ? GAME_WIDTH / 2 : this.startX;
        this.y = 100; this.vx = 0; this.vy = 0; this.life = 8; this.maxLife = 8; this.isDead = false; this.damageCooldown = 150; this.facingRight = true; this.animFrame = 0;
        this.spriteKey = this.id === '1P' ? p1CharType : p2CharType;
    }
    update() {
        if (this.isDead) return;
        if (keys[this.controls.left]) this.vx -= MOVE_ACCEL; else if (keys[this.controls.right]) this.vx += MOVE_ACCEL; else this.vx *= FRICTION; 
        if (this.vx > MAX_MOVE_SPEED) this.vx = MAX_MOVE_SPEED; if (this.vx < -MAX_MOVE_SPEED) this.vx = -MAX_MOVE_SPEED; this.x += this.vx;
        if (this.vx > 0.5) this.facingRight = true; else if (this.vx < -0.5) this.facingRight = false;
        if (this.x < 0) this.x = GAME_WIDTH; if (this.x > GAME_WIDTH) this.x = 0;
        this.vy += GRAVITY; if (keys[this.controls.down]) this.vy += 0.5; if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED; this.y += this.vy;
        if (this.damageCooldown > 0) this.damageCooldown--; this.animFrame += Math.abs(this.vx) * 0.15;
        if (this.y > GAME_HEIGHT || this.life <= 0) {
            if (this.revivesLeft > 0) { this.revivesLeft--; this.life = this.maxLife; let safePlatforms = platforms.filter(p => p.y > 100 && p.y < GAME_HEIGHT - 200 && p.type !== TYPE.SPIKE); let safeP = safePlatforms.length > 0 ? safePlatforms[0] : platforms[0]; this.x = safeP.x + safeP.width / 2; this.y = safeP.y - 100; this.vy = 0; this.damageCooldown = 150; } else { this.isDead = true; }
        }
    }
    draw(ctx) { drawFriendlyCharacter(ctx, this.x, this.y - this.height/2 + 4, this.spriteKey, this.facingRight, this.animFrame, this.isDead, this.damageCooldown); }
}

const p1 = new Player('1P', { left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown' }); 
const p2 = new Player('2P', { left: 'KeyA', right: 'KeyD', down: 'KeyS' });

function generatePlatformData() {
    let type = TYPE.NORMAL; let items = []; const baseRand = Math.random(); if (baseRand < 0.20) type = TYPE.SPIKE; else if (baseRand < 0.35) type = TYPE.BELT_LEFT; else if (baseRand < 0.50) type = TYPE.BELT_RIGHT;
    if (type === TYPE.NORMAL || type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) {
        let itemRand = Math.random(); if (itemRand < 0.25) { type = TYPE.BONUS; const heartCount = Math.floor(Math.random() * 3) + 1; for(let i=0; i<heartCount; i++) items.push('heart'); } else if (itemRand >= 0.25 && itemRand < 0.28) { type = TYPE.SPEED_UP; items.push('speedup'); } else if (itemRand >= 0.28 && itemRand < 0.38) { type = TYPE.SPEED_DOWN; items.push('speeddown'); }
    } return { type, items };
}
function createPlatform(y, isFirst = false) {
    if (isFirst) { platforms.push({ x: GAME_WIDTH / 2 - 120, y, width: 240, height: 28, type: TYPE.NORMAL, items: [] }); return; }
    const twoPlatforms = Math.random() < 0.4;
    if (twoPlatforms) {
        let w1 = 80 + Math.random() * 60; let x1 = Math.random() * (GAME_WIDTH / 2 - w1); let data1 = generatePlatformData(); platforms.push({ x: x1, y, width: w1, height: 28, type: data1.type, items: data1.items });
        let w2 = 80 + Math.random() * 60; let x2 = GAME_WIDTH / 2 + Math.random() * (GAME_WIDTH / 2 - w2); let data2 = generatePlatformData(); platforms.push({ x: x2, y, width: w2, height: 28, type: data2.type, items: data2.items });
    } else {
        let w = 150 + Math.random() * 100; let prevP = platforms[platforms.length - 1]; let minX = Math.max(0, prevP.x - w + 40); let maxX = Math.min(GAME_WIDTH - w, prevP.x + prevP.width - 40); if (maxX < minX) { minX = 0; maxX = GAME_WIDTH - w; } let x = minX + Math.random() * (maxX - minX); let data = generatePlatformData(); platforms.push({ x, y, width: w, height: 28, type: data.type, items: data.items });
    }
}
function initPlatforms() { platforms = []; createPlatform(300, true); let currentY = 300; for (let i = 1; i < 7; i++) { currentY += CONFIG.GAP_DISTANCE; createPlatform(currentY); } }
function checkGameOver() {
    if (gameState !== STATE.PLAYING) return;
    if ((gameMode === 1 && p1.isDead) || (gameMode === 2 && p1.isDead && p2.isDead)) { gameState = STATE.GAMEOVER; setTimeout(() => { const lb = getLeaderboard(); if (lb.length < 10 || floorCount > lb[lb.length-1].floors) { const name = prompt("🎉 破紀錄啦！請輸入你的大名：", "匿名特工"); if (name) saveToLeaderboard(name, floorCount); } gameState = STATE.LEADERBOARD; }, 800); }
}

function update() {
    if (gameState !== STATE.PLAYING) return; p1.update(); if (gameMode === 2) p2.update(); checkGameOver(); platforms.forEach(p => p.y -= currentPlatformSpeed);
    if (platforms.length > 0 && platforms[0].y < -50) { platforms.shift(); floorCount++; if (floorCount % 10 === 0 && currentPlatformSpeed < CONFIG.MAX_SPEED) { currentPlatformSpeed = Math.min(CONFIG.MAX_SPEED, currentPlatformSpeed + 0.2); } }
    let lastPlatform = platforms[platforms.length - 1]; if (lastPlatform.y < GAME_HEIGHT) createPlatform(lastPlatform.y + CONFIG.GAP_DISTANCE);
    let activePlayers = gameMode === 1 ? [p1] : [p1, p2];
    activePlayers.forEach(player => {
        if(player.isDead) return; if (player.y - player.height/2 <= 15) { if (player.damageCooldown <= 0) { player.life -= 2; player.damageCooldown = 100; } player.y += 30; player.vy = 2; }
        for (let p of platforms) {
            const playerBottom = player.y + player.height/2; const platformTop = p.y;
            if (player.x + player.width/2 > p.x && player.x - player.width/2 < p.x + p.width) {
                if (playerBottom >= platformTop && playerBottom - player.vy <= platformTop + 20) {
                    player.y = platformTop - player.height/2; player.vy = -currentPlatformSpeed; 
                    if (p.items && p.items.length > 0) {
                        let newItems = []; p.items.forEach(item => { if (item === 'heart') { if (player.life < player.maxLife) { player.life = Math.min(player.maxLife, player.life + 2); } else { newItems.push(item); } } else if (item === 'speedup') { currentPlatformSpeed = Math.min(CONFIG.MAX_SPEED, currentPlatformSpeed + 0.2); } else if (item === 'speeddown') { currentPlatformSpeed = Math.max(1.0, currentPlatformSpeed - 0.6); } }); p.items = newItems; if(p.items.length === 0) p.type = TYPE.NORMAL; 
                    }
                    if (p.type === TYPE.SPIKE) { if (player.damageCooldown <= 0) { player.life -= 2; player.damageCooldown = 100; } } else if (p.type === TYPE.BELT_LEFT) { player.x -= 3.0; } else if (p.type === TYPE.BELT_RIGHT) { player.x += 3.0; }
                    break; 
                }
            }
        }
    }); bgOffsetY = (bgOffsetY + currentPlatformSpeed * 0.2) % 40;
}

function drawBackground() { ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.beginPath(); for(let i = 0; i < GAME_WIDTH; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, GAME_HEIGHT); } for(let j = -40; j < GAME_HEIGHT; j += 40) { ctx.moveTo(0, j - bgOffsetY); ctx.lineTo(GAME_WIDTH, j - bgOffsetY); } ctx.stroke(); }
function drawPlatforms() { const timeOffset = Date.now() / 150; platforms.forEach(p => { drawPremiumPlatform(ctx, p.x, p.y, p.width, p.height, p.type, timeOffset); if (p.type === TYPE.SPIKE) drawSpikes(ctx, p.x, p.y, p.width); if (p.items && p.items.length > 0) { let heartRendered = 0; p.items.forEach((item) => { if (item === 'heart') { const spacing = 35; const totalHearts = p.items.filter(i => i==='heart').length; const startX = (p.x + p.width/2) - ((totalHearts-1) * spacing / 2); drawPixelHeart(ctx, startX + (heartRendered * spacing), p.y - 20, 1.2, true); heartRendered++; } else if (item === 'speedup') { drawSpeedArrows(ctx, p.x + p.width/2, p.y + p.height/2, TYPE.SPEED_UP); } else if (item === 'speeddown') { drawSpeedArrows(ctx, p.x + p.width/2, p.y + p.height/2, TYPE.SPEED_DOWN); } }); } }); drawPremiumPlatform(ctx, 0, 0, GAME_WIDTH, 15, TYPE.NORMAL, 0); }

// 🌟 智能進化：HUD 自動從全身圖裁切大頭貼，並套用加大與補正
function drawHUD() {
    if (gameState === STATE.START) return;
    const panelGrad = ctx.createLinearGradient(15, 15, 15, 95); panelGrad.addColorStop(0, '#f8fafc'); panelGrad.addColorStop(0.5, '#e2e8f0'); panelGrad.addColorStop(1, '#cbd5e1'); ctx.fillStyle = panelGrad; ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4; ctx.beginPath(); ctx.roundRect(15, 15, 300, 80, 8); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.stroke();

    const drawHUDAssets = (player, baseX, baseY) => {
        if(player.isDead) return;
        for (let i = 0; i < 4; i++) { drawPixelHeart(ctx, baseX + 15 + (i * 26), baseY + 15, 1.0, player.life >= (i+1)*2); }
        
        ctx.save(); ctx.translate(baseX + 25, baseY + 50); 
        const img = assets[player.spriteKey];
        if(img) {
            ctx.imageSmoothingEnabled = false; 
            const is9x6 = (img.width / img.height) > 1.2;
            let fw = is9x6 ? img.width / 9 : img.width / 4;
            let fh = is9x6 ? img.height / 6 : img.height / 4;
            
            // 如果是女角色(4x4)，HUD頭像也稍微放大一點
            let drawSize = is9x6 ? 40 : 48; 
            let offset = is9x6 ? -20 : -24;
            ctx.drawImage(img, 0, 0, fw, fh, offset, offset, drawSize, drawSize); 
        }
        ctx.restore();
        
        ctx.fillStyle = '#2f3542'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left'; ctx.fillText(player.id, baseX + 45, baseY + 55); ctx.fillStyle = '#e67e22'; ctx.font = 'bold 14px Arial'; ctx.fillText(`👼 x${player.revivesLeft}`, baseX + 80, baseY + 53);
    };
    
    drawHUDAssets(p1, 20, 20); if(gameMode === 2) drawHUDAssets(p2, 160, 20);
    ctx.fillStyle = '#2f3542'; ctx.font = 'bold 36px "Orbitron", monospace'; ctx.textAlign = 'left'; ctx.fillText(`第 ${String(floorCount).padStart(4, '0')} 層`, 330, 55); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(330, 70); ctx.lineTo(580, 70); ctx.stroke(); ctx.fillStyle = '#e1b12c'; ctx.font = 'bold 16px Arial'; ctx.fillText(`SPEED: ${currentPlatformSpeed.toFixed(1)}`, 330, 90);
}

function drawUI() {
    if (gameState === STATE.START) {
        ctx.fillStyle = 'rgba(248, 250, 252, 0.95)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); 
        ctx.fillStyle = '#2d3436'; ctx.textAlign = 'center'; ctx.font = 'bold 50px Arial'; ctx.fillText('瘋狂下樓梯', GAME_WIDTH / 2, 90); 

        ctx.fillStyle = '#64748b'; ctx.font = 'bold 16px Arial'; ctx.fillText('步驟 1：選擇遊玩模式', GAME_WIDTH / 2, 140);
        const drawTab = (label, x, y, isSelected) => {
            ctx.fillStyle = isSelected ? '#2980b9' : '#e2e8f0'; ctx.strokeStyle = isSelected ? '#1a5276' : '#cbd5e1'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(x, y, 200, 45, 8); ctx.fill(); ctx.stroke();
            ctx.fillStyle = isSelected ? '#ffffff' : '#64748b'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.fillText(label, x + 100, y + 28);
        };
        drawTab('1P 單人特訓', 80, 160, !isTwoPlayer);
        drawTab('2P 雙人干擾', 320, 160, isTwoPlayer);

        ctx.fillStyle = '#64748b'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('步驟 2：選擇特工陣容', GAME_WIDTH / 2, 250);

        const drawBtn = (id, label, x, y, isSelected, spriteKey) => {
            ctx.fillStyle = isSelected ? (isTwoPlayer ? '#f39c12' : '#0984e3') : '#ffffff'; 
            ctx.strokeStyle = isSelected ? '#2d3436' : '#cbd5e1'; ctx.lineWidth = 2.5; 
            ctx.beginPath(); ctx.roundRect(x, y, 250, 75, 10); ctx.fill(); ctx.stroke(); 
            ctx.fillStyle = isSelected ? '#ffffff' : '#2d3436'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'left'; 
            ctx.fillText(`組合 ${id} : ${label}`, x + 15, y + 30);
            
            ctx.save(); ctx.translate(x + 195, y + 35); 
            const img = assets[spriteKey];
            if(img) {
                ctx.imageSmoothingEnabled = false;
                const is9x6 = (img.width / img.height) > 1.2;
                let fw = is9x6 ? img.width / 9 : img.width / 4; let fh = is9x6 ? img.height / 6 : img.height / 4;
                let drawSize = is9x6 ? 40 : 48; let offset = is9x6 ? -20 : -24;
                ctx.drawImage(img, 0, 0, fw, fh, offset, offset, drawSize, drawSize); 
            } ctx.restore();
        };

        if (!isTwoPlayer) {
            drawBtn(1, '貓影特工 ♀', 40, 280, sel1P === 1, 'sprite_female1'); 
            drawBtn(2, '灰髮特工 ♂', 310, 280, sel1P === 2, 'sprite_male1');
            drawBtn(3, '緋紅特工 ♀', 40, 380, sel1P === 3, 'sprite_female2'); 
            drawBtn(4, '藍髮特工 ♂', 310, 380, sel1P === 4, 'sprite_male2');
        } else {
            drawBtn(5, '貓影 ＆ 灰髮', 40, 280, sel2P === 5, 'sprite_female1'); 
            drawBtn(6, '緋紅 ＆ 藍髮', 310, 280, sel2P === 6, 'sprite_female2');
            drawBtn(7, '雙女子戰隊', 40, 380, sel2P === 7, 'sprite_female1'); 
            drawBtn(8, '雙男子硬漢', 310, 380, sel2P === 8, 'sprite_male1');
        }

        ctx.fillStyle = '#ff7675'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center'; 
        if (Math.floor(Date.now() / 500) % 2 === 0) ctx.fillText('PRESS ENTER TO START', GAME_WIDTH / 2, GAME_HEIGHT - 80);
    }
    if (gameState === STATE.PAUSED) { ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.roundRect(GAME_WIDTH/2 - 160, GAME_HEIGHT/2 - 60, 320, 120, 12); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#2d3436'; ctx.textAlign = 'center'; ctx.font = 'bold 32px Arial'; ctx.fillText('GAME PAUSED', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10); ctx.font = 'bold 16px Arial'; ctx.fillText('PRESS SPACE', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40); }
    if (gameState === STATE.GAMEOVER) { ctx.fillStyle = 'rgba(248, 250, 252, 0.9)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.fillStyle = '#d63031'; ctx.textAlign = 'center'; ctx.font = 'bold 56px Arial'; ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20); }
    if (gameState === STATE.LEADERBOARD) { ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.fillStyle = '#38bdf8'; ctx.textAlign = 'center'; ctx.font = 'bold 40px Arial'; ctx.fillText('🏆 TOP 10 排行榜', GAME_WIDTH / 2, 80); const lb = getLeaderboard(); ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left'; ctx.fillText('排名', 60, 140); ctx.fillText('代號', 130, 140); ctx.fillText('樓層', 320, 140); ctx.fillText('時間', 420, 140); ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(50, 150); ctx.lineTo(550, 150); ctx.stroke(); ctx.font = '18px Arial'; lb.forEach((entry, i) => { const y = 190 + i * 40; ctx.fillStyle = i < 3 ? '#fbbf24' : '#cbd5e1'; ctx.fillText(`# ${i+1}`, 60, y); ctx.fillStyle = '#f8fafc'; ctx.fillText(entry.name.substring(0,8), 130, y); ctx.fillStyle = '#f87171'; ctx.fillText(`${entry.floors} 層`, 320, y); ctx.fillStyle = '#64748b'; ctx.font = '14px Arial'; ctx.fillText(entry.date, 420, y); ctx.font = '18px Arial'; }); ctx.fillStyle = '#0284c7'; ctx.beginPath(); ctx.roundRect(GAME_WIDTH/2 - 120, 700, 240, 50, 8); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 20px Arial'; ctx.fillText('按 ENTER 返回', GAME_WIDTH/2, 732); }
}

window.addEventListener('keydown', (e) => {
    if(["Space","ArrowUp","ArrowDown"].indexOf(e.code) > -1) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'Space') { if (gameState === STATE.PLAYING) gameState = STATE.PAUSED; else if (gameState === STATE.PAUSED) gameState = STATE.PLAYING; }
    if (gameState === STATE.START) {
        if (e.code === 'Enter') startGame();
    } else if (gameState === STATE.LEADERBOARD && e.code === 'Enter') gameState = STATE.START;
}, { passive: false });
window.addEventListener('keyup', (e) => keys[e.code] = false);

canvas.addEventListener('mousedown', (e) => {
    if (gameState !== STATE.START) return;
    const rect = canvas.getBoundingClientRect(); const mx = (e.clientX - rect.left) * (canvas.width / rect.width); const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    if (my > 160 && my < 205) {
        if (mx > 80 && mx < 280) isTwoPlayer = false;
        if (mx > 320 && mx < 520) isTwoPlayer = true;
    }
    if (my > 280 && my < 355) { 
        if (mx > 40 && mx < 290) { if(!isTwoPlayer) sel1P = 1; else sel2P = 5; }
        if (mx > 310 && mx < 560) { if(!isTwoPlayer) sel1P = 2; else sel2P = 6; }
    }
    if (my > 380 && my < 455) {
        if (mx > 40 && mx < 290) { if(!isTwoPlayer) sel1P = 3; else sel2P = 7; }
        if (mx > 310 && mx < 560) { if(!isTwoPlayer) sel1P = 4; else sel2P = 8; }
    }
});

function startGame() {
    floorCount = 1; currentPlatformSpeed = CONFIG.START_SPEED; 
    gameMode = isTwoPlayer ? 2 : 1;
    
    if (gameMode === 1) {
        if (sel1P === 1) p1CharType = 'sprite_female1';
        else if (sel1P === 2) p1CharType = 'sprite_male1';
        else if (sel1P === 3) p1CharType = 'sprite_female2';
        else if (sel1P === 4) p1CharType = 'sprite_male2';
    } else {
        if (sel2P === 5) { p1CharType = 'sprite_female1'; p2CharType = 'sprite_male1'; }
        else if (sel2P === 6) { p1CharType = 'sprite_female2'; p2CharType = 'sprite_male2'; }
        else if (sel2P === 7) { p1CharType = 'sprite_female1'; p2CharType = 'sprite_female2'; }
        else if (sel2P === 8) { p1CharType = 'sprite_male1'; p2CharType = 'sprite_male2'; }
    }
    
    initPlatforms(); p1.reset(true); p2.reset(true); gameState = STATE.PLAYING;
}

function gameLoop() {
    if (gameState === STATE.PLAYING) update(); drawBackground(); 
    if (gameState === STATE.PLAYING || gameState === STATE.PAUSED || gameState === STATE.GAMEOVER) { drawPlatforms(); if(!p1.isDead) p1.draw(ctx); if(gameMode === 2 && !p2.isDead) p2.draw(ctx); }
    drawHUD(); drawUI(); requestAnimationFrame(gameLoop);
}

initGameAssets().then(() => { initPlatforms(); gameLoop(); });