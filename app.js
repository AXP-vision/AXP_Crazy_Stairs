// app.js - AXP Clinical Deluxe: Custom UI Modal & Supabase Integration

// ==========================================
// 🛡️ AXP 商業防護與設定
// ==========================================
const allowedDomains = ["localhost", "127.0.0.1", "axp-vision.github.io", "rabbit-turtle-m792.squarespace.com", "www.fantastic-vision.com", "fantastic-vision.com", ""];

if (!allowedDomains.includes(window.location.hostname) && window.location.hostname !== "") {
    document.body.innerHTML = `<h2 style="color:#e74c3c; text-align:center; margin-top:20vh; font-family:Arial;">⚠️ 未經授權的使用</h2>`;
    throw new Error("Security Check Failed."); 
}

// ==========================================
// ☁️ Supabase 雲端資料庫初始化
// ==========================================
const SUPABASE_URL = 'https://wvholwcyrldixlsgoege.supabase.co'; // 例如：'https://xxxx.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_BozJ84tPQF-jBHGKtXKqgw_ELodM54e'; // 一大串英數字
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let globalLeaderboardData = []; // 暫存雲端抓下來的排行榜

let canvas, ctx, container;
const GAME_WIDTH = 600;
const GAME_HEIGHT = 800;

function setupCanvas() {
    container = document.getElementById('canvas-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'canvas-container';
        document.body.appendChild(container);
    }
    container.innerHTML = ''; 
    container.style.position = 'relative'; // 🌟 為了讓自訂 UI 面板能完美重疊在遊戲上

    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    container.appendChild(canvas);

    canvas.width = GAME_WIDTH;
    canvas.height = GAME_HEIGHT;
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    canvas.style.backgroundColor = '#f8fafc';
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
}

function resizeCanvas() {
    if (!canvas) return;
    const scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT) * 0.95;
    canvas.style.width = `${GAME_WIDTH * scale}px`;
    canvas.style.height = `${GAME_HEIGHT * scale}px`;
}

// ==========================================
// 📦 遊戲資產管理
// ==========================================
const assets = {};
const initGameAssets = () => {
    return new Promise((resolve) => {
        let loaded = 0;
        const imagesToLoad = {
            sprite_female1: 'sprite_female1.png', 
            sprite_male1: 'sprite_male1.png',     
            sprite_female2: 'sprite_female2.png', 
            sprite_male2: 'sprite_male2.png'      
        };
        const total = Object.keys(imagesToLoad).length;
        if (total === 0) resolve();

        for (const key in imagesToLoad) {
            const img = new Image();
            img.onload = () => { assets[key] = img; loaded++; if (loaded === total) resolve(); };
            img.onerror = () => { console.warn(`無法載入資產: ${imagesToLoad[key]}`); loaded++; if (loaded === total) resolve(); };
            img.src = imagesToLoad[key];
        }
    });
};

// ==========================================
// ⚙️ 核心系統與狀態管理
// ==========================================
const STATE = { START: 0, PLAYING: 1, PAUSED: 2, GAMEOVER: 3, LEADERBOARD: 4 };
let gameState = STATE.START;

let isTwoPlayer = false;
let p1Confirmed = false;
let p2Confirmed = false;

let isOknMoving = false;    
let oknDirection = 1;       
let oknSpeedLevel = 1;      
let currentOknOffset = 0;   

let selP1 = 1; 
let selP2 = 2; 

let p1CharType = 'sprite_female1';
let p2CharType = 'sprite_male1';
const charKeysMap = ['sprite_female1', 'sprite_male1', 'sprite_female2', 'sprite_male2'];

const CONFIG = { START_SPEED: 1.5, MAX_SPEED: 8.0, SPEED_STEP: 0.05, GAP_DISTANCE: 165 };
let currentPlatformSpeed = CONFIG.START_SPEED;
const GRAVITY = 0.4; const MAX_FALL_SPEED = 9.0; const MAX_MOVE_SPEED = 7.0; const MOVE_ACCEL = 0.5; const FRICTION = 0.85;

let floorCount = 1; let platforms = []; let keys = {}; let gameMode = 1; let bgOffsetY = 0;
const TYPE = { NORMAL: 0, SPIKE: 1, BELT_LEFT: 2, BELT_RIGHT: 3, BONUS: 4, SPEED_UP: 5, SPEED_DOWN: 6 };

// ==========================================
// 🎨 渲染繪圖與補正引擎
// ==========================================
function drawPixelHeart(ctx, x, y, size, isFull) {
    const scaledSize = size * 1.5; ctx.save(); ctx.translate(x, y); ctx.scale(scaledSize, scaledSize);
    ctx.fillStyle = isFull ? '#e74c3c' : '#f1f2f6'; ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-5, 0, -10, 5, 0, 15); ctx.bezierCurveTo(10, 5, 5, 0, 0, 5); ctx.fill(); ctx.stroke();
    ctx.restore();
}

function drawFriendlyCharacter(ctx, x, y, spriteKey, facingRight, animFrame, isDead, damageCooldown) {
    if (isDead || (damageCooldown > 0 && Math.floor(Date.now() / 50) % 2 === 0)) return;
    const img = assets[spriteKey]; if (!img) return; 

    ctx.save(); ctx.translate(x, y); 
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(0, 20, 14, 4, 0, 0, Math.PI*2); ctx.fill();

    let fw, fh, sx, sy, numFrames, yVisualOffset = 0, scaleMultiplier = 1, scaleX = 1;
    const is9x6Format = (img.width / img.height) > 1.2;

    if (!is9x6Format) {
        fw = img.width / 4; fh = img.height / 4; numFrames = 4;
        const fIdx = Math.floor(animFrame / 15) % numFrames; sx = fIdx * fw; sy = 2 * fh; 
        yVisualOffset = 14; scaleMultiplier = 1.35; if (!facingRight) scaleX = -1;
    } else {
        fw = img.width / 9; fh = img.height / 6; numFrames = 3;
        const fIdx = Math.floor(animFrame / 15) % numFrames; sx = fIdx * fw; sy = 0 * fh; 
        yVisualOffset = 16; scaleMultiplier = 1.0; scaleX = facingRight ? -1 : 1; 
    }

    ctx.scale(scaleX, 1);
    const targetHeight = 48 * scaleMultiplier; const targetWidth = targetHeight * (fw / fh); 
    const dx = -targetWidth / 2; const dy = -targetHeight / 2 + yVisualOffset; 
    
    ctx.imageSmoothingEnabled = false; 
    ctx.drawImage(img, sx, sy, fw, fh, dx, dy, targetWidth, targetHeight);
    ctx.restore();
}

function drawPremiumPlatform(ctx, x, y, w, h, type, timeOffset) {
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.roundRect(x, y + 4, w, h, 6); ctx.fill();
    ctx.beginPath(); 
    if (type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) { ctx.arc(x + h/2, y + h/2, h/2, Math.PI/2, Math.PI*1.5); ctx.lineTo(x + w - h/2, y); ctx.arc(x + w - h/2, y + h/2, h/2, Math.PI*1.5, Math.PI/2); } 
    else { ctx.roundRect(x, y, w, h, 6); } ctx.closePath(); 
    
    const grad = ctx.createLinearGradient(x, y, x, y + h); grad.addColorStop(0, '#f1f5f9'); grad.addColorStop(0.3, '#e2e8f0'); grad.addColorStop(1, '#64748b'); 
    ctx.fillStyle = grad; ctx.fill(); ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5; ctx.stroke(); 
    
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; 
    if (type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) { ctx.beginPath(); ctx.arc(x + h/2, y + h/2, h/2 - 1, Math.PI/2, Math.PI*1.5); ctx.lineTo(x + w - h/2, y + 1); ctx.arc(x + w - h/2, y + h/2, h/2 - 1, Math.PI*1.5, Math.PI/2); ctx.closePath(); ctx.stroke(); } 
    else { ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); } ctx.restore();

    if (type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) {
        ctx.save(); ctx.clip(); ctx.fillStyle = type === TYPE.BELT_LEFT ? 'rgba(52, 152, 219, 0.2)' : 'rgba(155, 89, 182, 0.2)'; ctx.fillRect(x, y, w, h); const dir = type === TYPE.BELT_LEFT ? 'left' : 'right';
        for (let i = -20; i < w + 40; i += 45) {
            const shift = type === TYPE.BELT_LEFT ? (i - timeOffset * 12) % (w + 40) : (i + timeOffset * 12) % (w + 40); const drawX = shift < -20 ? w + 40 + shift : shift;
            ctx.save(); ctx.translate(x + drawX, y + h/2); if (dir === 'left') ctx.scale(-1, 1);
            ctx.fillStyle = dir === 'left' ? '#2980b9' : '#8e44ad'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(2, 6); ctx.lineTo(2, -6); ctx.closePath(); ctx.fill();
            ctx.fillRect(-2, -3, 2, 6); ctx.fillRect(-6, -3, 2, 6); ctx.restore();
        } ctx.restore();
    }
    const rx1 = x + (type===TYPE.BELT_LEFT||type===TYPE.BELT_RIGHT ? h/2 : 12); const rx2 = x + w - (type===TYPE.BELT_LEFT||type===TYPE.BELT_RIGHT ? h/2 : 12);
    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(rx1, y+h/2, 2.5, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(rx2, y+h/2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(rx1 - 0.5, y+h/2 - 0.5, 1, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(rx2 - 0.5, y+h/2 - 0.5, 1, 0, Math.PI*2); ctx.fill(); ctx.restore();
}

function drawSpikes(ctx, x, y, w) {
    for (let i = 0; i < w; i += 16) {
        const spikeW = Math.min(16, w - i); const sx = x + i; 
        const grad = ctx.createLinearGradient(sx, y, sx + spikeW, y);
        grad.addColorStop(0, '#94a3b8'); grad.addColorStop(0.5, '#f8fafc'); grad.addColorStop(1, '#475569');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + spikeW/2, y - 24); ctx.lineTo(sx + spikeW, y); ctx.fill();
    }
}

function drawSpeedArrows(ctx, x, y, type) {
    ctx.save(); ctx.strokeStyle = type === TYPE.SPEED_UP ? '#e74c3c' : '#0984e3'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let i = -15; i <= 15; i += 15) { ctx.beginPath(); if (type === TYPE.SPEED_UP) { ctx.moveTo(x + i - 6, y + 4); ctx.lineTo(x + i, y - 6); ctx.lineTo(x + i + 6, y + 4); } else { ctx.moveTo(x + i - 6, y - 6); ctx.lineTo(x + i, y + 4); ctx.lineTo(x + i + 6, y - 6); } ctx.stroke(); } ctx.restore();
}

function drawBackground() {
    if (isOknMoving && gameState === STATE.PLAYING) {
        currentOknOffset += (oknSpeedLevel * 1.0) * oknDirection;
        if (currentOknOffset >= 80) currentOknOffset -= 80;
        if (currentOknOffset <= -80) currentOknOffset += 80;
    }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = '#cbd5e1'; 
    for (let i = -80; i < GAME_WIDTH + 80; i += 80) { ctx.fillRect(i + currentOknOffset, 0, 40, GAME_HEIGHT); }
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
            if (this.revivesLeft > 0) {
                this.revivesLeft--; this.life = this.maxLife;
                let safePlatforms = platforms.filter(p => p.y > 100 && p.y < GAME_HEIGHT - 200 && p.type !== TYPE.SPIKE);
                let safeP = safePlatforms.length > 0 ? safePlatforms[0] : platforms[0];
                this.x = safeP.x + safeP.width / 2; this.y = safeP.y - 100; this.vy = 0; this.damageCooldown = 150; 
            } else { this.isDead = true; }
        }
    }
    draw(ctx) { drawFriendlyCharacter(ctx, this.x, this.y - this.height/2 + 4, this.spriteKey, this.facingRight, this.animFrame, this.isDead, this.damageCooldown); }
}

const p1 = new Player('1P', { left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown' }); 
const p2 = new Player('2P', { left: 'KeyA', right: 'KeyD', down: 'KeyS' });

function generatePlatformData() {
    let type = TYPE.NORMAL; let items = []; const baseRand = Math.random();
    if (baseRand < 0.20) type = TYPE.SPIKE; else if (baseRand < 0.35) type = TYPE.BELT_LEFT; else if (baseRand < 0.50) type = TYPE.BELT_RIGHT;
    if (type === TYPE.NORMAL || type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) {
        let itemRand = Math.random();
        if (itemRand < 0.25) { type = TYPE.BONUS; const heartCount = Math.floor(Math.random() * 3) + 1; for(let i=0; i<heartCount; i++) items.push('heart'); } 
        else if (itemRand >= 0.25 && itemRand < 0.28) { type = TYPE.SPEED_UP; items.push('speedup'); } 
        else if (itemRand >= 0.28 && itemRand < 0.38) { type = TYPE.SPEED_DOWN; items.push('speeddown'); }
    } return { type, items };
}

function createPlatform(y, isFirst = false) {
    if (isFirst) { platforms.push({ x: GAME_WIDTH / 2 - 120, y, width: 240, height: 28, type: TYPE.NORMAL, items: [] }); return; }
    const twoPlatforms = Math.random() < 0.4;
    if (twoPlatforms) {
        let w1 = 80 + Math.random() * 60; let x1 = Math.random() * (GAME_WIDTH / 2 - w1);
        let data1 = generatePlatformData(); platforms.push({ x: x1, y, width: w1, height: 28, type: data1.type, items: data1.items });
        let w2 = 80 + Math.random() * 60; let x2 = GAME_WIDTH / 2 + Math.random() * (GAME_WIDTH / 2 - w2);
        let data2 = generatePlatformData(); platforms.push({ x: x2, y, width: w2, height: 28, type: data2.type, items: data2.items });
    } else {
        let w = 150 + Math.random() * 100; let prevP = platforms[platforms.length - 1]; let minX = Math.max(0, prevP.x - w + 40); let maxX = Math.min(GAME_WIDTH - w, prevP.x + prevP.width - 40);
        if (maxX < minX) { minX = 0; maxX = GAME_WIDTH - w; } let x = minX + Math.random() * (maxX - minX);
        let data = generatePlatformData(); platforms.push({ x, y, width: w, height: 28, type: data.type, items: data.items });
    }
}

function initPlatforms() { platforms = []; createPlatform(300, true); let currentY = 300; for (let i = 1; i < 7; i++) { currentY += CONFIG.GAP_DISTANCE; createPlatform(currentY); } }

// 🌟 雲端非同步獲取排行榜資料
async function fetchLeaderboardData() {
    try {
        const { data, error } = await supabaseClient
            .from('leaderboard')
            .select('*')
            .order('floors', { ascending: false })
            .limit(10);
        if (data) globalLeaderboardData = data;
    } catch (err) {
        console.error("無法取得雲端排行榜:", err);
    }
}

// 🌟 終極解法：自訂 HTML 名字輸入面板 (解決 iframe 被擋彈出視窗的問題)
function showNameInputModal() {
    let modal = document.getElementById('axp-name-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'axp-name-modal';
        // 絕對置中、漂浮在畫布上的漂亮 UI
        modal.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(255,255,255,0.95); padding:30px; border-radius:16px; box-shadow:0 15px 40px rgba(0,0,0,0.4); text-align:center; z-index:100; width:80%; max-width:320px; font-family:Arial;';
        
        modal.innerHTML = `
            <h3 style="margin:0 0 10px 0; color:#2d3436; font-size:24px;">🎉 破紀錄啦！</h3>
            <p style="margin:0 0 15px 0; color:#64748b; font-size:16px;">請輸入你的特工代號（最多8字）：</p>
            <input type="text" id="axp-agent-name" value="特工" maxlength="8" style="width:80%; padding:12px; font-size:18px; border:2px solid #cbd5e1; border-radius:8px; margin-bottom:20px; text-align:center; outline:none; font-weight:bold; color:#2d3436; background:#f8fafc;">
            <br>
            <button id="axp-submit-score" style="background:#2980b9; color:white; border:none; padding:12px 25px; font-size:18px; border-radius:8px; cursor:pointer; font-weight:bold; width:100%; transition: background 0.2s;">送出成績</button>
        `;
        container.appendChild(modal);
        
        document.getElementById('axp-submit-score').addEventListener('click', async () => {
            const btn = document.getElementById('axp-submit-score');
            btn.innerText = '📡 成績上傳中...';
            btn.style.background = '#95a5a6';
            btn.disabled = true;

            const name = document.getElementById('axp-agent-name').value || '特工';
            const now = new Date();
            const dateStr = `${now.getFullYear()}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
            
            try {
                // 上傳並重新抓取排行榜
                await supabaseClient.from('leaderboard').insert([{ name: name, floors: floorCount, date: dateStr }]);
                await fetchLeaderboardData();
            } catch (err) {
                console.error('上傳失敗', err);
            }
            
            // 恢復 UI 狀態並跳轉
            modal.style.display = 'none';
            btn.innerText = '送出成績';
            btn.style.background = '#2980b9';
            btn.disabled = false;
            
            gameState = STATE.LEADERBOARD;
        });
    }
    modal.style.display = 'block';
    document.getElementById('axp-agent-name').focus();
}

// 🌟 非同步遊戲結束邏輯
async function checkGameOver() {
    if (gameState !== STATE.PLAYING) return;
    if ((gameMode === 1 && p1.isDead) || (gameMode === 2 && p1.isDead && p2.isDead)) {
        gameState = STATE.GAMEOVER;
        
        setTimeout(async () => {
            await fetchLeaderboardData();
            let lowestScore = globalLeaderboardData.length === 10 ? globalLeaderboardData[9].floors : 0;
            
            if (globalLeaderboardData.length < 10 || floorCount > lowestScore) { 
                // 🚀 呼叫我們自製的無敵 HTML 輸入框
                showNameInputModal();
            } else {
                gameState = STATE.LEADERBOARD;
            }
        }, 800);
    }
}

function update() {
    if (gameState !== STATE.PLAYING) return; p1.update(); if (gameMode === 2) p2.update(); checkGameOver();
    
    platforms.forEach(p => p.y -= currentPlatformSpeed);
    
    if (platforms.length > 0 && platforms[0].y < -50) { 
        platforms.shift(); floorCount++; 
        if (currentPlatformSpeed < CONFIG.MAX_SPEED) { currentPlatformSpeed = Math.min(CONFIG.MAX_SPEED, currentPlatformSpeed + CONFIG.SPEED_STEP); } 
    }
    
    let lastPlatform = platforms[platforms.length - 1]; if (lastPlatform.y < GAME_HEIGHT) createPlatform(lastPlatform.y + CONFIG.GAP_DISTANCE);
    
    let activePlayers = gameMode === 1 ? [p1] : [p1, p2];
    activePlayers.forEach(player => {
        if(player.isDead) return;
        if (player.y - player.height/2 <= 15) { if (player.damageCooldown <= 0) { player.life -= 2; player.damageCooldown = 100; } player.y += 30; player.vy = 2; }
        for (let p of platforms) {
            const playerBottom = player.y + player.height/2; const platformTop = p.y;
            if (player.x + player.width/2 > p.x && player.x - player.width/2 < p.x + p.width) {
                if (playerBottom >= platformTop && playerBottom - player.vy <= platformTop + 20) {
                    player.y = platformTop - player.height/2; player.vy = -currentPlatformSpeed; 
                    if (p.items && p.items.length > 0) {
                        let newItems = [];
                        p.items.forEach(item => {
                            if (item === 'heart') { if (player.life < player.maxLife) { player.life = Math.min(player.maxLife, player.life + 2); } else { newItems.push(item); } } 
                            else if (item === 'speedup') { currentPlatformSpeed = Math.min(CONFIG.MAX_SPEED, currentPlatformSpeed + 0.5); } 
                            else if (item === 'speeddown') { currentPlatformSpeed = Math.max(1.0, currentPlatformSpeed - 1.5); }
                        }); p.items = newItems; if(p.items.length === 0) p.type = TYPE.NORMAL; 
                    }
                    if (p.type === TYPE.SPIKE) { if (player.damageCooldown <= 0) { player.life -= 2; player.damageCooldown = 100; } } else if (p.type === TYPE.BELT_LEFT) { player.x -= 3.0; } else if (p.type === TYPE.BELT_RIGHT) { player.x += 3.0; }
                    break; 
                }
            }
        }
    }); 
}

function drawPlatforms() {
    const timeOffset = Date.now() / 150;
    platforms.forEach(p => {
        drawPremiumPlatform(ctx, p.x, p.y, p.width, p.height, p.type, timeOffset);
        if (p.type === TYPE.SPIKE) drawSpikes(ctx, p.x, p.y, p.width);
        if (p.items && p.items.length > 0) {
            let heartRendered = 0;
            p.items.forEach((item) => {
                if (item === 'heart') {
                    const spacing = 35; const totalHearts = p.items.filter(i => i==='heart').length; const startX = (p.x + p.width/2) - ((totalHearts-1) * spacing / 2);
                    drawPixelHeart(ctx, startX + (heartRendered * spacing), p.y - 20, 1.2, true); heartRendered++;
                } else if (item === 'speedup') { drawSpeedArrows(ctx, p.x + p.width/2, p.y + p.height/2, TYPE.SPEED_UP); } 
                else if (item === 'speeddown') { drawSpeedArrows(ctx, p.x + p.width/2, p.y + p.height/2, TYPE.SPEED_DOWN); }
            });
        }
    });
    drawPremiumPlatform(ctx, 0, 0, GAME_WIDTH, 15, TYPE.NORMAL, 0);
}

// ==========================================
// 🌟 介面與繪圖
// ==========================================
function drawHUD() {
    if (gameState === STATE.START) return;
    
    const panelGrad = ctx.createLinearGradient(15, 15, 15, 95); 
    panelGrad.addColorStop(0, 'rgba(248, 250, 252, 0.7)'); 
    panelGrad.addColorStop(0.5, 'rgba(226, 232, 240, 0.7)'); 
    panelGrad.addColorStop(1, 'rgba(203, 213, 225, 0.7)'); 
    
    ctx.fillStyle = panelGrad; 
    ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4; 
    ctx.beginPath(); ctx.roundRect(15, 15, 300, 80, 8); ctx.fill(); 
    
    ctx.shadowColor = 'transparent'; 
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.8)'; ctx.lineWidth = 2; ctx.stroke();

    const drawHUDAssets = (player, baseX, baseY) => {
        if(player.isDead) return;
        
        for (let i = 0; i < 4; i++) { drawPixelHeart(ctx, baseX + 15 + (i * 26), baseY + 15, 1.0, player.life >= (i+1)*2); }
        
        ctx.save(); ctx.translate(baseX + 25, baseY + 50); 
        const img = assets[player.spriteKey];
        if(img) {
            ctx.imageSmoothingEnabled = false; 
            const is9x6 = (img.width / img.height) > 1.2;
            let fw = is9x6 ? img.width / 9 : img.width / 4; let fh = is9x6 ? img.height / 6 : img.height / 4;
            const targetHeight = is9x6 ? 40 : 48; const targetWidth = targetHeight * (fw / fh);
            const dx = -targetWidth / 2; const dy = is9x6 ? -20 : -24;
            ctx.drawImage(img, 0, 0, fw, fh, dx, dy, targetWidth, targetHeight); 
        }
        ctx.restore();
        
        ctx.fillStyle = '#2f3542'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left'; ctx.fillText(player.id, baseX + 45, baseY + 55); 
        ctx.fillStyle = '#e67e22'; ctx.font = 'bold 14px Arial'; ctx.fillText(`👼 x${player.revivesLeft}`, baseX + 80, baseY + 53);
    };
    
    drawHUDAssets(p1, 20, 20); if(gameMode === 2) drawHUDAssets(p2, 160, 20);
    
    ctx.fillStyle = '#2f3542'; ctx.font = 'bold 36px "Orbitron", monospace'; ctx.textAlign = 'left'; ctx.fillText(`第 ${String(floorCount).padStart(4, '0')} 層`, 330, 55); 
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(330, 70); ctx.lineTo(580, 70); ctx.stroke(); 
    ctx.fillStyle = '#e1b12c'; ctx.font = 'bold 16px Arial'; ctx.fillText(`SPEED: ${currentPlatformSpeed.toFixed(1)}`, 330, 90);
}

function drawUI() {
    if (gameState !== STATE.START) return;

    ctx.fillStyle = 'rgba(248, 250, 252, 0.98)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); 
    
    ctx.fillStyle = '#2d3436'; ctx.textAlign = 'center'; ctx.font = 'bold 50px Arial'; ctx.fillText('瘋狂下樓梯', GAME_WIDTH / 2, 90); 

    ctx.fillStyle = '#64748b'; ctx.font = 'bold 16px Arial'; ctx.fillText('步驟 1：選擇遊玩模式', GAME_WIDTH / 2, 140);
    const drawTab = (label, x, y, isSelected, accentColor) => {
        ctx.fillStyle = isSelected ? accentColor : '#e2e8f0'; ctx.strokeStyle = isSelected ? '#1a5276' : '#cbd5e1'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x, y, 200, 45, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = isSelected ? '#ffffff' : '#64748b'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.fillText(label, x + 100, y + 28);
    };
    drawTab('單人闖關', 80, 160, !isTwoPlayer, '#2980b9'); drawTab('雙人模式', 320, 160, isTwoPlayer, '#f39c12');

    let title = !isTwoPlayer ? '步驟 2：選擇你的特工' : (!p1Confirmed ? '步驟 2：P1 選擇特工' : '步驟 3：P2 選擇特工');
    ctx.fillStyle = '#64748b'; ctx.font = 'bold 20px Arial'; ctx.fillText(title, GAME_WIDTH / 2, 240);

    const charNames = ['貓影特工 ♀', '灰髮特工 ♂', '緋紅特工 ♀', '藍髮特工 ♂'];
    const charKeys = ['sprite_female1', 'sprite_male1', 'sprite_female2', 'sprite_male2'];

    const drawCharBtn = (idx, x, y) => {
        const currentSel = !isTwoPlayer ? selP1 : (!p1Confirmed ? selP1 : selP2);
        const isSelected = (currentSel === idx + 1); 
        
        ctx.fillStyle = isSelected ? '#ffffff' : '#f8fafc'; ctx.strokeStyle = isSelected ? '#2d3436' : '#cbd5e1'; ctx.lineWidth = isSelected ? 4 : 2; 
        ctx.beginPath(); ctx.roundRect(x, y, 250, 75, 12); ctx.fill(); ctx.stroke(); 
        ctx.fillStyle = '#2d3436'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'left'; ctx.fillText(charNames[idx], x + 20, y + 43);
        
        ctx.save(); ctx.translate(x + 200, y + 38); 
        const img = assets[charKeys[idx]];
        if(img) {
            ctx.imageSmoothingEnabled = false; const is9x6 = (img.width / img.height) > 1.2;
            let fw = is9x6 ? img.width / 9 : img.width / 4; let fh = is9x6 ? img.height / 6 : img.height / 4;
            const targetHeight = is9x6 ? 40 : 48; const targetWidth = targetHeight * (fw / fh);
            const dx = -targetWidth / 2; const dy = is9x6 ? -20 : -24;
            ctx.drawImage(img, 0, 0, fw, fh, dx, dy, targetWidth, targetHeight); 
        } ctx.restore();
    };

    drawCharBtn(0, 40, 270); drawCharBtn(1, 310, 270); drawCharBtn(2, 40, 370); drawCharBtn(3, 310, 370);

    const drawConfirmBtn = (label, color) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(150, 480, 300, 60, 10); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 22px Arial'; ctx.fillText(label, 300, 518);
    };

    if (!isTwoPlayer) {
        drawConfirmBtn('確認並開始遊戲', '#2980b9');
    } else {
        if (!p1Confirmed) drawConfirmBtn('確認 P1 選擇', '#2980b9');
        else if (!p2Confirmed) drawConfirmBtn('確認 P2 選擇', '#f39c12');
        else { ctx.fillStyle = '#27ae60'; ctx.font = 'bold 24px Arial'; ctx.fillText('角色已就緒！請按 ENTER 開始', 300, 520); }
    }

    ctx.fillStyle = '#94a3b8'; ctx.font = '14px Arial'; ctx.fillText('操作說明： 1P方向鍵 | 2P鍵盤WASD', 300, 720);
}

function drawOknButton() {
    ctx.save();
    
    ctx.fillStyle = isOknMoving ? 'rgba(46, 204, 113, 0.75)' : 'rgba(100, 116, 139, 0.75)'; 
    ctx.strokeStyle = '#2d3436'; 
    ctx.lineWidth = 2; ctx.beginPath();
    ctx.roundRect(485, 745, 95, 38, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
    ctx.fillText(isOknMoving ? 'OKN: ON' : 'OKN: OFF', 532, 768);

    ctx.fillStyle = 'rgba(52, 152, 219, 0.75)'; 
    ctx.beginPath(); ctx.roundRect(380, 745, 95, 38, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillText(oknDirection === 1 ? '➡ 向右' : '⬅ 向左', 427, 768);

    if (gameState === STATE.START) {
        ctx.fillStyle = oknSpeedLevel > 1 ? '#e74c3c' : '#95a5a6';
        ctx.beginPath(); ctx.roundRect(210, 745, 40, 38, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillText('-', 230, 768);

        ctx.fillStyle = '#2d3436'; ctx.font = 'bold 16px Arial';
        ctx.fillText(`速度: ${oknSpeedLevel}`, 290, 769);

        ctx.fillStyle = oknSpeedLevel < 5 ? '#e74c3c' : '#95a5a6';
        ctx.beginPath(); ctx.roundRect(330, 745, 40, 38, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillText('+', 350, 768);
    }
    ctx.restore();
}

function drawGameState() {
    if (gameState === STATE.PAUSED) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.roundRect(GAME_WIDTH/2 - 160, GAME_HEIGHT/2 - 60, 320, 120, 12); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#2d3436'; ctx.textAlign = 'center'; ctx.font = 'bold 32px Arial'; ctx.fillText('GAME PAUSED', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10); ctx.font = 'bold 16px Arial'; ctx.fillText('PRESS SPACE', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
    }
    if (gameState === STATE.GAMEOVER) {
        ctx.fillStyle = 'rgba(248, 250, 252, 0.75)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); 
        ctx.fillStyle = '#d63031'; ctx.textAlign = 'center'; ctx.font = 'bold 56px Arial'; ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
    }
    if (gameState === STATE.LEADERBOARD) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT); 
        
        ctx.fillStyle = '#38bdf8'; ctx.textAlign = 'center'; ctx.font = 'bold 40px Arial'; ctx.fillText('🏆 TOP 10 排行榜', GAME_WIDTH / 2, 80);
        
        ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left'; ctx.fillText('排名', 60, 140); ctx.fillText('代號', 130, 140); ctx.fillText('樓層', 320, 140); ctx.fillText('時間', 420, 140); ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(50, 150); ctx.lineTo(550, 150); ctx.stroke(); ctx.font = '18px Arial';
        
        globalLeaderboardData.forEach((entry, i) => { 
            const y = 190 + i * 40; 
            ctx.fillStyle = i < 3 ? '#fbbf24' : '#cbd5e1'; 
            ctx.fillText(`# ${i+1}`, 60, y); 
            ctx.fillStyle = '#f8fafc'; ctx.fillText(entry.name.substring(0,8), 130, y); 
            ctx.fillStyle = '#f87171'; ctx.fillText(`${entry.floors} 層`, 320, y); 
            ctx.fillStyle = '#94a3b8'; ctx.font = '14px Arial'; ctx.fillText(entry.date, 420, y); ctx.font = '18px Arial'; 
        });
        
        ctx.fillStyle = '#0284c7'; ctx.beginPath(); ctx.roundRect(GAME_WIDTH/2 - 120, 700, 240, 50, 8); ctx.fill(); 
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = 'bold 20px Arial'; ctx.fillText('按 ENTER 返回', GAME_WIDTH/2, 732);
    }
}

// ==========================================
// 🖱️ 操控與事件監聽
// ==========================================
window.addEventListener('keydown', (e) => {
    // 🌟 防止玩家在輸入名字時，按鍵觸發遊戲功能
    if (e.target.tagName === 'INPUT') return; 

    if(["Space","ArrowUp","ArrowDown"].indexOf(e.code) > -1) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'Space') { if (gameState === STATE.PLAYING) gameState = STATE.PAUSED; else if (gameState === STATE.PAUSED) gameState = STATE.PLAYING; }
    
    if (gameState === STATE.START && e.code === 'Enter') {
        if (!isTwoPlayer) { startGame(); } else { if (!p1Confirmed) { p1Confirmed = true; } else if (!p2Confirmed) { p2Confirmed = true; startGame(); } }
    } else if (gameState === STATE.LEADERBOARD && e.code === 'Enter') { 
        gameState = STATE.START; p1Confirmed = false; p2Confirmed = false; 
    }
}, { passive: false });

window.addEventListener('keyup', (e) => keys[e.code] = false);

function bindMouseEvents() {
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect(); 
        const mx = (e.clientX - rect.left) * (GAME_WIDTH / rect.width); 
        const my = (e.clientY - rect.top) * (GAME_HEIGHT / rect.height);
        
        if (mx > 485 && mx < 580 && my > 745 && my < 783) { isOknMoving = !isOknMoving; return; }
        if (mx > 380 && mx < 475 && my > 745 && my < 783) { oknDirection *= -1; return; }
        
        if (gameState === STATE.LEADERBOARD) {
            if (mx > 180 && mx < 420 && my > 700 && my < 750) {
                gameState = STATE.START; p1Confirmed = false; p2Confirmed = false; return;
            }
        }

        if (gameState === STATE.START) {
            if (mx > 210 && mx < 250 && my > 745 && my < 783) { if (oknSpeedLevel > 1) oknSpeedLevel--; return; } 
            if (mx > 330 && mx < 370 && my > 745 && my < 783) { if (oknSpeedLevel < 5) oknSpeedLevel++; return; } 
        }

        if (gameState !== STATE.START) return;

        if (my > 150 && my < 195) {
            if (mx > 80 && mx < 280) { isTwoPlayer = false; p1Confirmed = false; p2Confirmed = false; }
            if (mx > 320 && mx < 520) { isTwoPlayer = true; p1Confirmed = false; p2Confirmed = false; }
        }
        
        const checkCharClick = () => {
            if (my > 270 && my < 345) { if (mx > 40 && mx < 290) return 1; if (mx > 310 && mx < 560) return 2; }
            if (my > 370 && my < 445) { if (mx > 40 && mx < 290) return 3; if (mx > 310 && mx < 560) return 4; }
            return null;
        };
        
        const clickedIdx = checkCharClick();
        if (clickedIdx !== null) {
            if (!isTwoPlayer) selP1 = clickedIdx;
            else { if (!p1Confirmed) selP1 = clickedIdx; else if (!p2Confirmed) selP2 = clickedIdx; }
        }

        if (mx > 150 && mx < 450 && my > 480 && my < 540) {
            if (!isTwoPlayer) startGame();
            else { if (!p1Confirmed) p1Confirmed = true; else if (!p2Confirmed) { p2Confirmed = true; startGame(); } }
        }
    });
}

function startGame() {
    floorCount = 1; currentPlatformSpeed = CONFIG.START_SPEED; bgOffsetY = 0; 
    gameMode = isTwoPlayer ? 2 : 1;
    if (gameMode === 1) { p1CharType = charKeysMap[selP1-1]; } 
    else { p1CharType = charKeysMap[selP1-1]; p2CharType = charKeysMap[selP2-1]; }
    initPlatforms(); p1.reset(true); p2.reset(true); gameState = STATE.PLAYING;
}

function gameLoop() {
    if (gameState === STATE.PLAYING) update(); 
    drawBackground(); 
    if (gameState >= STATE.PLAYING && gameState <= STATE.GAMEOVER) { 
        drawPlatforms(); if(!p1.isDead) p1.draw(ctx); if(gameMode === 2 && !p2.isDead) p2.draw(ctx); 
    }
    drawHUD(); drawUI(); drawOknButton(); drawGameState(); 
    requestAnimationFrame(gameLoop);
}

// ==========================================
// 🚀 核心防彈啟動順序
// ==========================================
function bootGame() {
    setupCanvas();          
    bindMouseEvents();      
    initGameAssets().then(() => { 
        initPlatforms(); 
        fetchLeaderboardData().then(() => { gameLoop(); });
    });
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', bootGame); } 
else { bootGame(); }